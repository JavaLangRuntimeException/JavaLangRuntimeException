package gateway

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
)

// purgeBatch は 1 回の purge_cache で送れる数（ホスト名・URL とも、無料プランで 100）
const purgeBatch = 100

// CloudflarePurgeConfig の Token は、このゾーンの Cache Purge の権限があるトークン（DNS のトークンに足してもよい）
type CloudflarePurgeConfig struct {
	// API は https://api.cloudflare.com/client/v4（テストでは差し替える）
	API    string
	Token  string
	ZoneID string
	// HostSuffix・AliasZone は消してよいホスト名（DNS と同じ: <名前>-...-cloud.taramanji.com と、独自ドメインの <ラベル>.taramanji.com）
	HostSuffix string
	AliasZone  string
}

type cloudflarePurge struct {
	http *http.Client
	c    CloudflarePurgeConfig
}

func NewCloudflarePurge(c CloudflarePurgeConfig) (gateway.CachePurger, error) {
	if c.Token == "" || !zoneRe.MatchString(c.ZoneID) || !strings.HasPrefix(c.HostSuffix, "-") {
		return nil, fmt.Errorf("cloudflare cache purge needs a token, a zone ID and a host suffix")
	}
	if c.API == "" {
		c.API = "https://api.cloudflare.com/client/v4"
	}
	return &cloudflarePurge{http: &http.Client{Timeout: 15 * time.Second}, c: c}, nil
}

// allowed は taramanji cloud が扱うホスト名か（taramanji.com 本体などのキャッシュは消さない）
func (p *cloudflarePurge) allowed(host string) bool {
	if label, ok := strings.CutSuffix(host, p.c.HostSuffix); ok && label != "" && !strings.ContainsAny(label, "./*") {
		return true
	}
	if p.c.AliasZone == "" {
		return false
	}
	label, ok := strings.CutSuffix(host, "."+p.c.AliasZone)
	return ok && label != "" && !strings.ContainsAny(label, "./*")
}

func (p *cloudflarePurge) PurgeHosts(ctx context.Context, hosts []string) error {
	for _, h := range hosts {
		if !p.allowed(h) {
			return fmt.Errorf("%s のキャッシュは消せません（taramanji cloud のホスト名ではありません）", h)
		}
	}
	return p.send(ctx, "hosts", hosts)
}

func (p *cloudflarePurge) PurgeURLs(ctx context.Context, urls []string) error {
	for _, raw := range urls {
		u, err := url.Parse(raw)
		if err != nil || u.Scheme != "https" || !p.allowed(u.Host) {
			return fmt.Errorf("%s のキャッシュは消せません（taramanji cloud の URL ではありません）", raw)
		}
	}
	return p.send(ctx, "files", urls)
}

func (p *cloudflarePurge) send(ctx context.Context, field string, items []string) error {
	for start := 0; start < len(items); start += purgeBatch {
		end := min(start+purgeBatch, len(items))
		body, _ := json.Marshal(map[string][]string{field: items[start:end]})
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.c.API+"/zones/"+url.PathEscape(p.c.ZoneID)+"/purge_cache", bytes.NewReader(body))
		if err != nil {
			return err
		}
		req.Header.Set("Authorization", "Bearer "+p.c.Token)
		req.Header.Set("Content-Type", "application/json")
		res, err := p.http.Do(req)
		if err != nil {
			return err
		}
		raw, _ := io.ReadAll(io.LimitReader(res.Body, 64<<10))
		res.Body.Close()
		if res.StatusCode/100 != 2 {
			if res.StatusCode == http.StatusTooManyRequests || bytes.Contains(raw, []byte(`"code":1134`)) {
				return fmt.Errorf("Cloudflare のキャッシュの消去が多すぎます（無料プランのホスト名ごとの消去は 1 分に 5 回まで）。少し待ってからやり直してください")
			}
			if res.StatusCode == http.StatusForbidden || res.StatusCode == http.StatusUnauthorized {
				return fmt.Errorf("Cloudflare のトークンにキャッシュを消す権限（Cache Purge）がありません")
			}
			return fmt.Errorf("cloudflare purge_cache: HTTP %d: %s", res.StatusCode, bytes.TrimSpace(raw[:min(len(raw), 300)]))
		}
	}
	return nil
}
