// Package gateway は Cloudflare Access のトークンの検証の実装。
// 署名（RS256）はチームの公開鍵（https://<team>/cdn-cgi/access/certs）で、発行元（iss）と対象のアプリ（aud）も確かめる。
package gateway

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/javalangruntimeexception/taramanji/backend/internal/identity/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/httpx"
)

// 公開鍵は Cloudflare が入れ替えるので、1 時間で取り直し、知らない kid が来たときも取り直す（1 分に 1 回まで）
const (
	keysTTL         = time.Hour
	minRefetchAfter = time.Minute
)

type cfAccess struct {
	issuer   string
	certsURL string
	audience []string
	client   *http.Client
	clock    func() time.Time

	mu        sync.Mutex
	keys      map[string]*rsa.PublicKey
	fetchedAt time.Time
}

// NewCloudflareAccess は teamDomain（例: solitary-sun-32e2.cloudflareaccess.com）と、
// 受け付ける Access アプリの AUD（カンマ区切り）で検証器を作る
func NewCloudflareAccess(teamDomain, audCSV string) (gateway.AccessVerifier, error) {
	return newCloudflareAccess(teamDomain, audCSV, "", time.Now)
}

// newCloudflareAccess は certsURL と時計を差し替えられる（テスト用）
func newCloudflareAccess(teamDomain, audCSV, certsURL string, clock func() time.Time) (*cfAccess, error) {
	teamDomain = strings.TrimSuffix(strings.TrimPrefix(strings.TrimSpace(teamDomain), "https://"), "/")
	var aud []string
	for _, a := range strings.Split(audCSV, ",") {
		if a = strings.TrimSpace(a); a != "" {
			aud = append(aud, a)
		}
	}
	if teamDomain == "" || len(aud) == 0 {
		return nil, errors.New("CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD are required")
	}
	if certsURL == "" {
		certsURL = "https://" + teamDomain + "/cdn-cgi/access/certs"
	}
	return &cfAccess{issuer: "https://" + teamDomain, certsURL: certsURL, audience: aud,
		client: httpx.New(10 * time.Second), clock: clock}, nil
}

type accessClaims struct {
	Email string `json:"email"`
	jwt.RegisteredClaims
}

func (c *cfAccess) Verify(ctx context.Context, token string) (*gateway.Identity, error) {
	if token == "" {
		return nil, errors.New("no Cloudflare Access token")
	}
	var cl accessClaims
	_, err := jwt.ParseWithClaims(token, &cl, func(t *jwt.Token) (any, error) {
		kid, _ := t.Header["kid"].(string)
		return c.key(ctx, kid)
	}, jwt.WithValidMethods([]string{"RS256"}), jwt.WithIssuer(c.issuer), jwt.WithExpirationRequired(),
		jwt.WithTimeFunc(c.clock), jwt.WithLeeway(30*time.Second))
	if err != nil {
		return nil, err
	}
	// 同じチームの別のアプリ（Argo Rollouts の画面など）のトークンは受け付けない
	if !slices.ContainsFunc(cl.Audience, func(a string) bool { return slices.Contains(c.audience, a) }) {
		return nil, errors.New("Cloudflare Access token is for another application")
	}
	// サービストークン（機械用）はメールアドレスを持たないので、ここで弾く
	if cl.Email == "" {
		return nil, errors.New("Cloudflare Access token has no email")
	}
	return &gateway.Identity{Email: cl.Email, Expiry: cl.ExpiresAt.Time}, nil
}

func (c *cfAccess) key(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := c.clock()
	if k, ok := c.keys[kid]; ok && now.Sub(c.fetchedAt) < keysTTL {
		return k, nil
	}
	if c.keys == nil || now.Sub(c.fetchedAt) >= minRefetchAfter {
		keys, err := c.fetch(ctx)
		if err != nil {
			return nil, err
		}
		c.keys, c.fetchedAt = keys, now
	}
	if k, ok := c.keys[kid]; ok {
		return k, nil
	}
	return nil, fmt.Errorf("unknown Cloudflare Access key %q", kid)
}

func (c *cfAccess) fetch(ctx context.Context) (map[string]*rsa.PublicKey, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.certsURL, nil)
	if err != nil {
		return nil, err
	}
	res, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Cloudflare Access certs HTTP %d", res.StatusCode)
	}
	return parseJWKS(body)
}

// parseJWKS は certs の応答（JWK Set）から RSA の公開鍵を kid ごとに取り出す
func parseJWKS(body []byte) (map[string]*rsa.PublicKey, error) {
	var set struct {
		Keys []struct {
			Kid string `json:"kid"`
			Kty string `json:"kty"`
			N   string `json:"n"`
			E   string `json:"e"`
		} `json:"keys"`
	}
	if err := json.Unmarshal(body, &set); err != nil {
		return nil, err
	}
	keys := map[string]*rsa.PublicKey{}
	for _, k := range set.Keys {
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
		return nil, errors.New("no RSA keys in Cloudflare Access certs")
	}
	return keys, nil
}
