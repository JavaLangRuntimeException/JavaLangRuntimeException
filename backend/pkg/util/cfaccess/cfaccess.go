// Package cfaccess は Cloudflare Access が付ける JWT（Cf-Access-Jwt-Assertion）を検証する（横断ユーティリティ）。
// taramanji cloud のコンソールは taramanji.com のセッション（AUTH_SECRET）を使わず、Access のログインだけを信じる。
// Access の前段を飛ばしてトンネル以外から届いたリクエスト（クラスター内の Pod など）も、署名と aud で弾く。
package cfaccess

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"

	"connectrpc.com/connect"
	"github.com/golang-jwt/jwt/v5"

	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/errs"
)

// Header は Access がオリジンへのリクエストに付ける JWT のヘッダー
const Header = "Cf-Access-Jwt-Assertion"

const (
	keysTTL = time.Hour
	// 鍵の入れ替え直後に知らない kid が来たら取り直す。ただし偽の kid で取りに行かされ続けないよう間隔を空ける
	refetchInterval = time.Minute
)

// Config は検証の条件
type Config struct {
	// TeamDomain は https://<チーム名>.cloudflareaccess.com（iss と公開鍵の取得先）
	TeamDomain string
	// AUD は Access のアプリケーションの Audience タグ（アプリごとに違うので、他のアプリの JWT は通らない）
	AUD string
	// Email はコンソールを使える人（1 人）
	Email string
	// Origins はブラウザからの Origin として許すもの（https://cloud.taramanji.com など）。CSRF よけ
	Origins []string
	// HTTP は公開鍵の取得に使う。nil なら既定
	HTTP  *http.Client
	Clock func() time.Time
}

// Verifier は Access の公開鍵をキャッシュして JWT を検証する
type Verifier struct {
	cfg       Config
	mu        sync.Mutex
	keys      map[string]*rsa.PublicKey
	fetchedAt time.Time
}

func New(cfg Config) (*Verifier, error) {
	if !strings.HasPrefix(cfg.TeamDomain, "https://") || cfg.AUD == "" || cfg.Email == "" {
		return nil, errors.New("cfaccess: TeamDomain (https://...), AUD and Email are required")
	}
	cfg.TeamDomain = strings.TrimRight(cfg.TeamDomain, "/")
	if cfg.HTTP == nil {
		cfg.HTTP = &http.Client{Timeout: 10 * time.Second}
	}
	if cfg.Clock == nil {
		cfg.Clock = time.Now
	}
	return &Verifier{cfg: cfg}, nil
}

type jwk struct {
	Kid string `json:"kid"`
	Kty string `json:"kty"`
	N   string `json:"n"`
	E   string `json:"e"`
}

func (v *Verifier) fetchKeys(ctx context.Context) (map[string]*rsa.PublicKey, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, v.cfg.TeamDomain+"/cdn-cgi/access/certs", nil)
	if err != nil {
		return nil, err
	}
	res, err := v.cfg.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("cfaccess: certs HTTP %d", res.StatusCode)
	}
	var body struct {
		Keys []jwk `json:"keys"`
	}
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		return nil, err
	}
	keys := map[string]*rsa.PublicKey{}
	for _, k := range body.Keys {
		if k.Kty != "RSA" {
			continue
		}
		n, err1 := base64.RawURLEncoding.DecodeString(k.N)
		e, err2 := base64.RawURLEncoding.DecodeString(k.E)
		if err1 != nil || err2 != nil {
			continue
		}
		keys[k.Kid] = &rsa.PublicKey{N: new(big.Int).SetBytes(n), E: int(new(big.Int).SetBytes(e).Int64())}
	}
	if len(keys) == 0 {
		return nil, errors.New("cfaccess: no RSA keys")
	}
	return keys, nil
}

func (v *Verifier) key(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	v.mu.Lock()
	defer v.mu.Unlock()
	now := v.cfg.Clock()
	k, ok := v.keys[kid]
	age := now.Sub(v.fetchedAt)
	if ok && age < keysTTL {
		return k, nil
	}
	if !ok && age < refetchInterval {
		return nil, errors.New("cfaccess: unknown key id")
	}
	keys, err := v.fetchKeys(ctx)
	if err != nil {
		if ok {
			return k, nil // 取り直しに失敗しても、知っている鍵ならそのまま使う
		}
		return nil, err
	}
	v.keys, v.fetchedAt = keys, now
	if k, ok = keys[kid]; !ok {
		return nil, errors.New("cfaccess: unknown key id")
	}
	return k, nil
}

type claims struct {
	Email string `json:"email"`
	jwt.RegisteredClaims
}

// Verify は JWT を検証し、ログインした人のメールアドレスを返す
func (v *Verifier) Verify(ctx context.Context, token string) (string, error) {
	if token == "" {
		return "", errs.New(errs.ErrorTypeUnauthorized, "Cloudflare Access のログインが必要です").WithCode("access_required")
	}
	var c claims
	_, err := jwt.ParseWithClaims(token, &c, func(t *jwt.Token) (any, error) {
		kid, _ := t.Header["kid"].(string)
		return v.key(ctx, kid)
	},
		jwt.WithValidMethods([]string{"RS256"}),
		jwt.WithIssuer(v.cfg.TeamDomain),
		jwt.WithAudience(v.cfg.AUD),
		jwt.WithExpirationRequired(),
		jwt.WithTimeFunc(v.cfg.Clock),
	)
	if err != nil {
		return "", errs.New(errs.ErrorTypeUnauthorized, "Cloudflare Access のログインが切れています").WithCode("access_invalid").WithCause(err)
	}
	if !strings.EqualFold(c.Email, v.cfg.Email) {
		return "", errs.New(errs.ErrorTypeForbidden, "このアカウントでは使えません").WithCode("not_allowed")
	}
	return c.Email, nil
}

// CheckOrigin はブラウザが付けた Origin が許可したものか（付いていなければ通す。Connect の POST にはブラウザが必ず付ける）
func (v *Verifier) CheckOrigin(h http.Header) error {
	o := h.Get("Origin")
	if o == "" {
		return nil
	}
	for _, allowed := range v.cfg.Origins {
		if o == allowed {
			return nil
		}
	}
	return errs.New(errs.ErrorTypeForbidden, "許可されていない Origin です").WithCode("bad_origin")
}

type emailKey struct{}

// EmailFrom は Interceptor が検証したメールアドレス
func EmailFrom(ctx context.Context) string {
	s, _ := ctx.Value(emailKey{}).(string)
	return s
}

// WithEmail はテスト用に、検証済みのメールアドレスを ctx に入れる
func WithEmail(ctx context.Context, email string) context.Context {
	return context.WithValue(ctx, emailKey{}, email)
}

// Interceptor はすべての RPC で Origin と Access の JWT を確かめる
func (v *Verifier) Interceptor() connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			if err := v.CheckOrigin(req.Header()); err != nil {
				return nil, errs.ToConnect(ctx, err)
			}
			email, err := v.Verify(ctx, req.Header().Get(Header))
			if err != nil {
				return nil, errs.ToConnect(ctx, err)
			}
			return next(WithEmail(ctx, email), req)
		}
	}
}
