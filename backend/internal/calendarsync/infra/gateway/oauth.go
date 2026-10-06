package gateway

import (
	"context"
	"errors"
	"net/http"
	"time"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"

	"github.com/javalangruntimeexception/taramanji/backend/internal/calendarsync/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/httpx"
)

const userinfoURL = "https://openidconnect.googleapis.com/v1/userinfo"

// Scopes は calendar.events だけで予定の読み書きができる。メールアドレスは userinfo（email スコープ）で取る
var Scopes = []string{"openid", "email", "https://www.googleapis.com/auth/calendar.events"}

// NewOAuthConfig はアカウント接続用の OAuth クライアント（管理画面ログインと同じ taramanji-calendar-sync）
func NewOAuthConfig(clientID, clientSecret, redirectURL string) *oauth2.Config {
	return &oauth2.Config{ClientID: clientID, ClientSecret: clientSecret, RedirectURL: redirectURL,
		Endpoint: google.Endpoint, Scopes: Scopes}
}

type oauth struct{ cfg *oauth2.Config }

func NewOAuth(cfg *oauth2.Config) gateway.OAuth { return &oauth{cfg: cfg} }

func (o *oauth) AuthURL(state, challenge, hint string) string {
	opts := []oauth2.AuthCodeOption{
		// 更新トークンを毎回もらうため consent。追加するアカウントを選び直せるよう select_account も付ける
		oauth2.AccessTypeOffline,
		oauth2.SetAuthURLParam("prompt", "consent select_account"),
		oauth2.SetAuthURLParam("code_challenge", challenge),
		oauth2.SetAuthURLParam("code_challenge_method", "S256"),
	}
	if hint != "" {
		opts = append(opts, oauth2.SetAuthURLParam("login_hint", hint))
	}
	return o.cfg.AuthCodeURL(state, opts...)
}

func (o *oauth) Exchange(ctx context.Context, code, verifier string) (string, string, error) {
	base := httpx.New(30 * time.Second)
	ctx = context.WithValue(ctx, oauth2.HTTPClient, base)
	tok, err := o.cfg.Exchange(ctx, code, oauth2.VerifierOption(verifier))
	if err != nil {
		return "", "", err
	}
	if tok.RefreshToken == "" {
		return "", "", ErrNoRefreshToken
	}
	c := &client{http: o.cfg.Client(ctx, tok), sleep: time.Sleep}
	var user struct {
		Email         string `json:"email"`
		EmailVerified *bool  `json:"email_verified"`
	}
	if err := c.do(ctx, http.MethodGet, userinfoURL, nil, &user); err != nil {
		return "", "", err
	}
	if user.Email == "" || (user.EmailVerified != nil && !*user.EmailVerified) {
		return "", "", ErrNoEmail
	}
	return tok.RefreshToken, user.Email, nil
}

var (
	ErrNoRefreshToken = errors.New("更新トークンを受け取れませんでした。もう一度接続してください")
	ErrNoEmail        = errors.New("メールアドレスを取得できませんでした")
)
