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
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
)

// CDN の独自ドメインを守る Access のアプリと、ログインの設定を写す元のアプリ（deploy/cloudflare/access.py が作る。CDN の *-cdn-cloud を守るもの）
const (
	DomainsAccessApp  = "taramanji-cloud-domains"
	TemplateAccessApp = "taramanji-cloud-apps"
)

var accountRe = regexp.MustCompile(`^[0-9a-f]{32}$`)

// CloudflareAccessConfig の Token は、アカウントの Access のアプリを編集できる API トークン（Access: Apps and Policies › Edit）。
// トークンはアカウントのどのアプリも変えられるが、このクライアントが触るのは DomainsAccessApp という名前のアプリだけ
type CloudflareAccessConfig struct {
	// API は https://api.cloudflare.com/client/v4（テストでは差し替える）
	API       string
	Token     string
	AccountID string
}

type cloudflareAccess struct {
	http *http.Client
	c    CloudflareAccessConfig
}

func NewCloudflareAccess(c CloudflareAccessConfig) (gateway.AccessHosts, error) {
	if c.Token == "" || !accountRe.MatchString(c.AccountID) {
		return nil, fmt.Errorf("cloudflare Access needs a token and an account ID")
	}
	if c.API == "" {
		c.API = "https://api.cloudflare.com/client/v4"
	}
	return &cloudflareAccess{http: &http.Client{Timeout: 15 * time.Second}, c: c}, nil
}

type accessPolicyRef struct {
	ID         string `json:"id"`
	Precedence int    `json:"precedence"`
}

type accessDestination struct {
	Type string `json:"type"`
	URI  string `json:"uri"`
}

type accessApp struct {
	ID                     string              `json:"id,omitempty"`
	Name                   string              `json:"name"`
	Type                   string              `json:"type"`
	Domain                 string              `json:"domain"`
	Destinations           []accessDestination `json:"destinations"`
	AllowedIDPs            []string            `json:"allowed_idps"`
	AutoRedirectToIdentity bool                `json:"auto_redirect_to_identity"`
	SessionDuration        string              `json:"session_duration"`
	AppLauncherVisible     bool                `json:"app_launcher_visible"`
	Policies               []accessPolicyRef   `json:"policies"`
}

func (a *cloudflareAccess) do(ctx context.Context, method, path string, in, out any) error {
	var body io.Reader
	if in != nil {
		b, err := json.Marshal(in)
		if err != nil {
			return err
		}
		body = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, a.c.API+"/accounts/"+url.PathEscape(a.c.AccountID)+"/access/apps"+path, body)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+a.c.Token)
	req.Header.Set("Content-Type", "application/json")
	res, err := a.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode/100 != 2 {
		return fmt.Errorf("cloudflare Access %s: HTTP %d: %s", method, res.StatusCode, bytes.TrimSpace(raw[:min(len(raw), 300)]))
	}
	if out == nil {
		return nil
	}
	var env struct {
		Result json.RawMessage `json:"result"`
	}
	if err := json.Unmarshal(raw, &env); err != nil {
		return err
	}
	return json.Unmarshal(env.Result, out)
}

// SetHosts は DomainsAccessApp の守るホスト名を hosts にそろえる。ログインの方法と許す人（ポリシー）は TemplateAccessApp と同じにする
func (a *cloudflareAccess) SetHosts(ctx context.Context, hosts []string) error {
	var apps []accessApp
	if err := a.do(ctx, http.MethodGet, "?per_page=100", nil, &apps); err != nil {
		return err
	}
	var tpl, cur *accessApp
	for i := range apps {
		switch apps[i].Name {
		case TemplateAccessApp:
			tpl = &apps[i]
		case DomainsAccessApp:
			cur = &apps[i]
		}
	}
	if len(hosts) == 0 {
		if cur == nil {
			return nil
		}
		return a.do(ctx, http.MethodDelete, "/"+url.PathEscape(cur.ID), nil, nil)
	}
	if tpl == nil || len(tpl.Policies) == 0 {
		return fmt.Errorf("Access のアプリ %s（とそのポリシー）がありません。先に deploy/cloudflare/access.py を実行してください", TemplateAccessApp)
	}
	body := accessApp{
		Name: DomainsAccessApp, Type: "self_hosted", Domain: hosts[0],
		AllowedIDPs: tpl.AllowedIDPs, AutoRedirectToIdentity: tpl.AutoRedirectToIdentity, SessionDuration: tpl.SessionDuration,
	}
	for _, h := range hosts {
		body.Destinations = append(body.Destinations, accessDestination{Type: "public", URI: h})
	}
	for _, p := range tpl.Policies {
		body.Policies = append(body.Policies, accessPolicyRef{ID: p.ID, Precedence: p.Precedence})
	}
	if body.SessionDuration == "" {
		body.SessionDuration = "24h"
	}
	if cur == nil {
		return a.do(ctx, http.MethodPost, "", body, nil)
	}
	return a.do(ctx, http.MethodPut, "/"+url.PathEscape(cur.ID), body, nil)
}
