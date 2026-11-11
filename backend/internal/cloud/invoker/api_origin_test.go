package invoker

import (
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/service"
)

// CDN の元が API: cloud-gw はその API のホスト名で Envoy に渡し直す（関数は起こさない。起こすのは Envoy の先の 2 回目）
func TestAPIOrigin(t *testing.T) {
	type seen struct{ host, fwdHost, path, api, fn, ttl string }
	got := make(chan seen, 1)
	envoy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got <- seen{r.Host, r.Header.Get("X-Forwarded-Host"), r.URL.Path, r.Header.Get(service.HeaderAPIOrigin), r.Header.Get(service.HeaderFunction), r.Header.Get(service.HeaderCacheTTL)}
		_, _ = io.WriteString(w, "from api")
	}))
	defer envoy.Close()
	u, _ := url.Parse(envoy.URL)
	sc := &fakeScaler{fns: map[string]*gateway.FunctionState{}}
	inv := New(Config{Scaler: sc, Upstream: func(string) *url.URL { return u }, IdleTimeout: time.Minute, ColdStartTimeout: time.Second,
		GatewayURL: u, APIHost: func(name string) string { return name + "-apigw-cloud.taramanji.com" }})

	req := httptest.NewRequest(http.MethodGet, "https://vrst-cdn-cloud.taramanji.com/api/items", nil)
	req.Header.Set(service.HeaderAPIOrigin, "backend")
	req.Header.Set(service.HeaderCacheTTL, "60")
	req.Header.Set(service.HeaderSPA, "false")
	rec := httptest.NewRecorder()
	inv.ServeHTTP(rec, req)
	s := <-got
	if rec.Code != 200 || rec.Body.String() != "from api" || rec.Header().Get("Cache-Control") != "public, max-age=60" {
		t.Fatalf("%d %q %v", rec.Code, rec.Body.String(), rec.Header())
	}
	if s.host != "backend-apigw-cloud.taramanji.com" || s.fwdHost != "vrst-cdn-cloud.taramanji.com" || s.path != "/api/items" || s.api != "" || s.fn != "" || s.ttl != "" {
		t.Fatalf("envoy に届いたもの: %+v", s)
	}
	if len(sc.scales) != 0 {
		t.Fatal("1 回目で関数を起こしてしまう")
	}
	// 名前でないものは渡さない
	bad := httptest.NewRequest(http.MethodGet, "https://vrst-cdn-cloud.taramanji.com/", nil)
	bad.Header.Set(service.HeaderAPIOrigin, "../x")
	rec = httptest.NewRecorder()
	inv.ServeHTTP(rec, bad)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("bad: %d", rec.Code)
	}
}

// CDN（ログイン済み）から渡し直したリクエストは、API キーを求めない。署名がない・偽物・古いものは求める
func TestViaCDNSkipsAPIKey(t *testing.T) {
	inv, _ := setupEcho(t)
	inv.c.InternalSecret = []byte("0123456789abcdef0123456789abcdef")
	now := time.Now()
	inv.c.Clock = func() time.Time { return now }
	_, meta, _ := service.NewAPIKey("ci")
	send := func(sig string) int {
		req := httptest.NewRequest(http.MethodGet, "https://shop-apigw-cloud.taramanji.com/x", nil)
		req.Header.Set(service.HeaderFunction, "api")
		req.Header.Set(service.HeaderAuth, service.AuthAPIKey)
		req.Header.Set(service.HeaderAPIKeys, "ci="+meta.Hash)
		if sig != "" {
			req.Header.Set(HeaderViaCDN, sig)
		}
		rec := httptest.NewRecorder()
		inv.ServeHTTP(rec, req)
		return rec.Code
	}
	if code := send(inv.signCDN("shop-apigw-cloud.taramanji.com", now)); code != 200 {
		t.Fatalf("CDN から: %d", code)
	}
	for name, sig := range map[string]string{
		"なし":       "",
		"偽物":       "1.deadbeef",
		"ほかのホスト名宛": inv.signCDN("other-apigw-cloud.taramanji.com", now),
		"古い":       inv.signCDN("shop-apigw-cloud.taramanji.com", now.Add(-2*time.Minute)),
		"形がおかしい":   "abc",
	} {
		if code := send(sig); code != http.StatusUnauthorized {
			t.Errorf("%s: %d", name, code)
		}
	}
	// 鍵がなければ、署名があっても API キーを求める
	sig := inv.signCDN("shop-apigw-cloud.taramanji.com", now)
	inv.c.InternalSecret = nil
	if code := send(sig); code != http.StatusUnauthorized {
		t.Fatalf("鍵なし: %d", code)
	}
}

// CDN から渡し直すときに、署名を付ける（利用者が付けてきた値は消して付け直す）
func TestAPIOriginSigns(t *testing.T) {
	got := make(chan string, 1)
	envoy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { got <- r.Header.Get(HeaderViaCDN) }))
	defer envoy.Close()
	u, _ := url.Parse(envoy.URL)
	inv := New(Config{Scaler: &fakeScaler{fns: map[string]*gateway.FunctionState{}}, Upstream: func(string) *url.URL { return u }, IdleTimeout: time.Minute,
		ColdStartTimeout: time.Second, GatewayURL: u, APIHost: func(n string) string { return n + "-apigw-cloud.taramanji.com" }, InternalSecret: []byte("k")})
	req := httptest.NewRequest(http.MethodGet, "https://vrst-cdn-cloud.taramanji.com/api", nil)
	req.Header.Set(service.HeaderAPIOrigin, "backend")
	req.Header.Set(HeaderViaCDN, "forged")
	inv.ServeHTTP(httptest.NewRecorder(), req)
	if sig := <-got; !inv.verifyCDN(sig, "backend-apigw-cloud.taramanji.com") {
		t.Fatalf("署名: %q", sig)
	}
}
