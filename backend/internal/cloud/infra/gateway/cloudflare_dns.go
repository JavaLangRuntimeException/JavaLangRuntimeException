package gateway

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
)

// 自分が作ったレコードの印（これが付いていて、向き先がトンネルのレコードだけを消す）
const dnsComment = "managed-by:taramanji-cloud"

var (
	zoneRe   = regexp.MustCompile(`^[0-9a-f]{32}$`)
	tunnelRe = regexp.MustCompile(`^[0-9a-f-]{36}$`)
)

// CloudflareDNSConfig の Token は、このゾーンの DNS の編集だけを許した API トークン
type CloudflareDNSConfig struct {
	// API は https://api.cloudflare.com/client/v4（テストでは差し替える）
	API      string
	Token    string
	ZoneID   string
	TunnelID string
	// HostSuffix で終わるホスト名だけを扱う（-cloud.taramanji.com など。taramanji.com 本体のレコードには触れない）
	HostSuffix string
	// AliasZone は CDN の独自ドメインのゾーン（"taramanji.com"）。<ラベル>.<ゾーン> も扱う。
	// 独自ドメインは、自分が作った印のあるレコードか、レコードがないときだけ扱う（コンソールなど、手で作ったトンネル向けのレコードを乗っ取らない）
	AliasZone string
}

type cloudflareDNS struct {
	http *http.Client
	c    CloudflareDNSConfig
}

func NewCloudflareDNS(c CloudflareDNSConfig) (gateway.DNS, error) {
	if !zoneRe.MatchString(c.ZoneID) || !tunnelRe.MatchString(c.TunnelID) || c.Token == "" || !strings.HasPrefix(c.HostSuffix, "-") {
		return nil, fmt.Errorf("cloudflare DNS needs a token, a zone ID, a tunnel ID and a host suffix")
	}
	if c.API == "" {
		c.API = "https://api.cloudflare.com/client/v4"
	}
	return &cloudflareDNS{http: &http.Client{Timeout: 15 * time.Second}, c: c}, nil
}

type dnsRecord struct {
	ID      string `json:"id,omitempty"`
	Type    string `json:"type"`
	Name    string `json:"name"`
	Content string `json:"content"`
	Proxied bool   `json:"proxied"`
	Comment string `json:"comment"`
}

func (d *cloudflareDNS) target() string { return d.c.TunnelID + ".cfargotunnel.com" }

func (d *cloudflareDNS) do(ctx context.Context, method, path string, in, out any) error {
	var body io.Reader
	if in != nil {
		b, err := json.Marshal(in)
		if err != nil {
			return err
		}
		body = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, d.c.API+"/zones/"+d.c.ZoneID+"/dns_records"+path, body)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+d.c.Token)
	req.Header.Set("Content-Type", "application/json")
	res, err := d.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		if len(b) > 300 {
			b = b[:300]
		}
		return fmt.Errorf("cloudflare DNS %s: HTTP %d: %s", method, res.StatusCode, b)
	}
	if out == nil {
		return nil
	}
	return json.Unmarshal(b, &struct {
		Result any `json:"result"`
	}{Result: out})
}

// isAlias は host が独自ドメイン（<ラベル>.<ゾーン>）か
func (d *cloudflareDNS) isAlias(host string) bool {
	if d.c.AliasZone == "" {
		return false
	}
	label, ok := strings.CutSuffix(host, "."+d.c.AliasZone)
	return ok && label != "" && !strings.ContainsAny(label, "./*")
}

func (d *cloudflareDNS) find(ctx context.Context, host string) ([]dnsRecord, error) {
	generated := strings.HasSuffix(host, d.c.HostSuffix) && !strings.ContainsAny(strings.TrimSuffix(host, d.c.HostSuffix), "./*")
	if !generated && !d.isAlias(host) {
		return nil, fmt.Errorf("%s は扱えるホスト名ではありません", host)
	}
	var records []dnsRecord
	err := d.do(ctx, http.MethodGet, "?name="+url.QueryEscape(host), nil, &records)
	return records, err
}

func (d *cloudflareDNS) Ensure(ctx context.Context, host string) error {
	records, err := d.find(ctx, host)
	if err != nil {
		return err
	}
	for _, r := range records {
		// 独自ドメインは、自分が作った印のあるものだけを「もうある」とみなす
		if r.Type == "CNAME" && r.Content == d.target() && (r.Comment == dnsComment || !d.isAlias(host)) {
			return nil
		}
		return fmt.Errorf("%s には既に別の DNS レコード（%s %s）があります", host, r.Type, r.Content)
	}
	return d.do(ctx, http.MethodPost, "", dnsRecord{Type: "CNAME", Name: host, Content: d.target(), Proxied: true, Comment: dnsComment}, nil)
}

func (d *cloudflareDNS) Remove(ctx context.Context, host string) error {
	records, err := d.find(ctx, host)
	if err != nil {
		return err
	}
	for _, r := range records {
		if r.Type != "CNAME" || r.Content != d.target() || r.Comment != dnsComment {
			// 自分が作ったものではない。残す
			continue
		}
		if err := d.do(ctx, http.MethodDelete, "/"+url.PathEscape(r.ID), nil, nil); err != nil {
			return err
		}
	}
	return nil
}
