package cfaccess

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

	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/errs"
)

const aud = "aud-cloud"

type fixture struct {
	v       *Verifier
	key     *rsa.PrivateKey
	team    string
	fetches *atomic.Int32
	now     time.Time
}

func setup(t *testing.T) *fixture {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	var fetches atomic.Int32
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/cdn-cgi/access/certs" {
			http.NotFound(w, r)
			return
		}
		fetches.Add(1)
		_ = json.NewEncoder(w).Encode(map[string]any{"keys": []map[string]string{{
			"kid": "k1", "kty": "RSA",
			"n": base64.RawURLEncoding.EncodeToString(key.N.Bytes()),
			"e": base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.E)).Bytes()),
		}}})
	}))
	t.Cleanup(srv.Close)
	now := time.Date(2026, 10, 22, 12, 0, 0, 0, time.UTC)
	f := &fixture{key: key, team: srv.URL, fetches: &fetches, now: now}
	f.v, err = New(Config{TeamDomain: srv.URL, AUD: aud, Email: "owner@example.com",
		Origins: []string{"https://cloud.taramanji.com"}, HTTP: srv.Client(), Clock: func() time.Time { return f.now }})
	if err != nil {
		t.Fatal(err)
	}
	return f
}

func (f *fixture) sign(t *testing.T, mutate func(*jwt.Token)) string {
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"iss": f.team, "aud": []string{aud}, "email": "Owner@example.com",
		"iat": f.now.Unix(), "exp": f.now.Add(time.Hour).Unix(),
	})
	tok.Header["kid"] = "k1"
	if mutate != nil {
		mutate(tok)
	}
	s, err := tok.SignedString(f.key)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func code(err error) string {
	if de, ok := errs.As(err); ok {
		return de.Code
	}
	return ""
}

func TestVerify(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	email, err := f.v.Verify(ctx, f.sign(t, nil))
	if err != nil || email != "Owner@example.com" {
		t.Fatalf("valid token: %q %v", email, err)
	}
	cases := map[string]struct {
		token string
		code  string
	}{
		"missing":       {"", "access_required"},
		"other app":     {f.sign(t, func(tk *jwt.Token) { tk.Claims.(jwt.MapClaims)["aud"] = []string{"aud-gws"} }), "access_invalid"},
		"other issuer":  {f.sign(t, func(tk *jwt.Token) { tk.Claims.(jwt.MapClaims)["iss"] = "https://evil.cloudflareaccess.com" }), "access_invalid"},
		"expired":       {f.sign(t, func(tk *jwt.Token) { tk.Claims.(jwt.MapClaims)["exp"] = f.now.Add(-time.Minute).Unix() }), "access_invalid"},
		"no expiry":     {f.sign(t, func(tk *jwt.Token) { delete(tk.Claims.(jwt.MapClaims), "exp") }), "access_invalid"},
		"other person":  {f.sign(t, func(tk *jwt.Token) { tk.Claims.(jwt.MapClaims)["email"] = "someone@example.com" }), "not_allowed"},
		"unknown kid":   {f.sign(t, func(tk *jwt.Token) { tk.Header["kid"] = "k2" }), "access_invalid"},
		"hs256 forgery": {hs256(t, f), "access_invalid"},
	}
	for name, c := range cases {
		if _, err := f.v.Verify(ctx, c.token); code(err) != c.code {
			t.Errorf("%s: got %v, want %s", name, err, c.code)
		}
	}
}

// hs256 は公開鍵を HMAC の鍵にした偽造（アルゴリズム混同攻撃）
func hs256(t *testing.T, f *fixture) string {
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"iss": f.team, "aud": aud, "email": "owner@example.com", "exp": f.now.Add(time.Hour).Unix()})
	tok.Header["kid"] = "k1"
	s, err := tok.SignedString(f.key.N.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestKeysAreCachedAndRefetchedSparingly(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	for i := 0; i < 3; i++ {
		if _, err := f.v.Verify(ctx, f.sign(t, nil)); err != nil {
			t.Fatal(err)
		}
	}
	// 知らない kid が続いても 1 分は取り直さない
	for i := 0; i < 3; i++ {
		_, _ = f.v.Verify(ctx, f.sign(t, func(tk *jwt.Token) { tk.Header["kid"] = "rotated" }))
	}
	if n := f.fetches.Load(); n != 1 {
		t.Fatalf("fetched %d times", n)
	}
	f.now = f.now.Add(2 * time.Hour)
	if _, err := f.v.Verify(ctx, f.sign(t, nil)); err != nil || f.fetches.Load() != 2 {
		t.Fatalf("after TTL: %v fetches %d", err, f.fetches.Load())
	}
}

func TestCheckOrigin(t *testing.T) {
	f := setup(t)
	for origin, ok := range map[string]bool{"": true, "https://cloud.taramanji.com": true, "https://taramanji.com": false, "https://evil.example": false} {
		h := http.Header{}
		if origin != "" {
			h.Set("Origin", origin)
		}
		if err := f.v.CheckOrigin(h); (err == nil) != ok {
			t.Errorf("%q: %v", origin, err)
		}
	}
}
