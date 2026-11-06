package gateway

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	team = "example.cloudflareaccess.com"
	aud  = "aud-admin"
)

func TestCloudflareAccessVerify(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	other, _ := rsa.GenerateKey(rand.Reader, 2048)
	var fetches atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		fetches.Add(1)
		_ = json.NewEncoder(w).Encode(map[string]any{"keys": []map[string]string{{
			"kid": "k1", "kty": "RSA", "alg": "RS256",
			"n": base64.RawURLEncoding.EncodeToString(key.N.Bytes()),
			"e": base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.E)).Bytes()),
		}}})
	}))
	defer srv.Close()

	now := time.Date(2026, 11, 7, 0, 0, 0, 0, time.UTC)
	v, err := newCloudflareAccess(team, " other-aud , "+aud, srv.URL, func() time.Time { return now })
	if err != nil {
		t.Fatal(err)
	}
	sign := func(k *rsa.PrivateKey, kid string, mod func(jwt.MapClaims)) string {
		c := jwt.MapClaims{"iss": "https://" + team, "aud": []string{aud}, "email": "admin@taramanji.com",
			"exp": now.Add(24 * time.Hour).Unix(), "iat": now.Unix(), "type": "app"}
		if mod != nil {
			mod(c)
		}
		tok := jwt.NewWithClaims(jwt.SigningMethodRS256, c)
		tok.Header["kid"] = kid
		s, err := tok.SignedString(k)
		if err != nil {
			t.Fatal(err)
		}
		return s
	}
	ctx := context.Background()

	id, err := v.Verify(ctx, sign(key, "k1", nil))
	if err != nil || id.Email != "admin@taramanji.com" || !id.Expiry.Equal(now.Add(24*time.Hour)) {
		t.Fatalf("id %+v err %v", id, err)
	}

	for name, tok := range map[string]string{
		"empty":         "",
		"other key":     sign(other, "k1", nil),
		"unknown kid":   sign(key, "k2", nil),
		"other app":     sign(key, "k1", func(c jwt.MapClaims) { c["aud"] = []string{"aud-rollouts"} }),
		"other team":    sign(key, "k1", func(c jwt.MapClaims) { c["iss"] = "https://evil.cloudflareaccess.com" }),
		"expired":       sign(key, "k1", func(c jwt.MapClaims) { c["exp"] = now.Add(-time.Hour).Unix() }),
		"no exp":        sign(key, "k1", func(c jwt.MapClaims) { delete(c, "exp") }),
		"service token": sign(key, "k1", func(c jwt.MapClaims) { delete(c, "email") }),
	} {
		if _, err := v.Verify(ctx, tok); err == nil {
			t.Errorf("%s: want error", name)
		}
	}
	// HS256（公開鍵を共有鍵として使う攻撃）も受け付けない
	hs, _ := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"iss": "https://" + team, "aud": aud,
		"email": "admin@taramanji.com", "exp": now.Add(time.Hour).Unix()}).SignedString(key.N.Bytes())
	if _, err := v.Verify(ctx, hs); err == nil {
		t.Error("HS256: want error")
	}
	// 知らない kid が続いても、公開鍵を取りに行くのは 1 分に 1 回まで
	if n := fetches.Load(); n != 1 {
		t.Errorf("fetches = %d, want 1", n)
	}
}

func TestNewCloudflareAccessRequiresConfig(t *testing.T) {
	if _, err := NewCloudflareAccess(team, " , "); err == nil {
		t.Fatal("want error without AUD")
	}
	if _, err := NewCloudflareAccess("", aud); err == nil {
		t.Fatal("want error without team domain")
	}
}
