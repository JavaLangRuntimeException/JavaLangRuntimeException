package invoker

import (
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/service"
)

// 関数が受け取ったヘッダーを返し、自分でも Access-Control-Allow-Origin を付ける関数
func setupEcho(t *testing.T) (*Invoker, *fakeScaler) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "https://from-function.example")
		_, _ = io.WriteString(w, "key="+r.Header.Get("X-Api-Key")+" name="+r.Header.Get("X-Api-Key-Name")+" auth="+r.Header.Get("X-Cloud-Auth")+" keys="+r.Header.Get("X-Cloud-Api-Keys"))
	}))
	t.Cleanup(upstream.Close)
	u, _ := url.Parse(upstream.URL)
	sc := &fakeScaler{fns: map[string]*gateway.FunctionState{"api": {Name: "api"}}, readyAfter: 1}
	inv := New(Config{Scaler: sc, Upstream: func(string) *url.URL { return u }, IdleTimeout: 5 * time.Minute,
		ColdStartTimeout: 5 * time.Second, Clock: time.Now})
	return inv, sc
}

func TestAPIKey(t *testing.T) {
	inv, sc := setupEcho(t)
	key, meta, _ := service.NewAPIKey("ci")
	send := func(apiKey, spoofName string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, "https://shop-apigw-cloud.taramanji.com/x", nil)
		req.Header.Set(service.HeaderFunction, "api")
		req.Header.Set(service.HeaderAuth, service.AuthAPIKey)
		req.Header.Set(service.HeaderAPIKeys, "ci="+meta.Hash)
		if apiKey != "" {
			req.Header.Set("X-Api-Key", apiKey)
		}
		if spoofName != "" {
			req.Header.Set("X-Api-Key-Name", spoofName)
		}
		rec := httptest.NewRecorder()
		inv.ServeHTTP(rec, req)
		return rec
	}
	// キーがない・違うときは 401 で、関数を起こさない
	for _, bad := range []string{"", "tck_wrong", meta.Hash} {
		if rec := send(bad, ""); rec.Code != http.StatusUnauthorized || !strings.Contains(rec.Body.String(), "x-api-key") {
			t.Fatalf("%q: %d %s", bad, rec.Code, rec.Body)
		}
	}
	if len(sc.scales) != 0 {
		t.Fatalf("認証の前に関数を起こしてしまう: %v", sc.scales)
	}
	// 当たれば通し、キーそのものは渡さず、キーの名前を渡す（利用者が付けた名前は上書き）。設定のヘッダーも渡さない
	rec := send(key, "admin")
	if rec.Code != 200 || rec.Body.String() != "key= name=ci auth= keys=" {
		t.Fatalf("ok: %d %q", rec.Code, rec.Body.String())
	}
	// 認証なしの API では、利用者が付けたキーの名前を渡さない（キーは関数が自分で使うかもしれないので渡す）
	req := httptest.NewRequest(http.MethodGet, "https://open-apigw-cloud.taramanji.com/x", nil)
	req.Header.Set(service.HeaderFunction, "api")
	req.Header.Set("X-Api-Key", "mine")
	req.Header.Set("X-Api-Key-Name", "admin")
	rec = httptest.NewRecorder()
	inv.ServeHTTP(rec, req)
	if rec.Code != 200 || rec.Body.String() != "key=mine name= auth= keys=" {
		t.Fatalf("no auth: %d %q", rec.Code, rec.Body.String())
	}
}

func TestCORS(t *testing.T) {
	inv, sc := setupEcho(t)
	do := func(method, origin string, extra map[string]string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, "https://shop-apigw-cloud.taramanji.com/x", nil)
		req.Header.Set(service.HeaderFunction, "api")
		req.Header.Set(service.HeaderCORS, "http://localhost:5173 https://front-storage-cloud.taramanji.com")
		if origin != "" {
			req.Header.Set("Origin", origin)
		}
		for k, v := range extra {
			req.Header.Set(k, v)
		}
		rec := httptest.NewRecorder()
		inv.ServeHTTP(rec, req)
		return rec
	}
	pre := map[string]string{"Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type, x-api-key"}
	// プリフライト: 許したオリジンには 204 で答え、関数は起こさない
	rec := do(http.MethodOptions, "https://Front-storage-cloud.taramanji.com", pre)
	if rec.Code != http.StatusNoContent || rec.Header().Get("Access-Control-Allow-Origin") != "https://Front-storage-cloud.taramanji.com" ||
		rec.Header().Get("Access-Control-Allow-Headers") != "content-type, x-api-key" || !strings.Contains(rec.Header().Get("Access-Control-Allow-Methods"), "POST") {
		t.Fatalf("preflight: %d %v", rec.Code, rec.Header())
	}
	if rec := do(http.MethodOptions, "https://evil.example", pre); rec.Code != http.StatusForbidden || rec.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatalf("preflight evil: %d %v", rec.Code, rec.Header())
	}
	// おかしな Access-Control-Request-Headers は返さない
	if rec := do(http.MethodOptions, "http://localhost:5173", map[string]string{"Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "x\r\nset-cookie: a=b"}); rec.Header().Get("Access-Control-Allow-Headers") != "" {
		t.Fatalf("headers: %v", rec.Header())
	}
	if len(sc.scales) != 0 {
		t.Fatalf("プリフライトで関数を起こしてしまう: %v", sc.scales)
	}
	// 本番のリクエスト: 許したオリジンなら付ける（関数が付けた値は使わない）。許していなければ付けない
	rec = do(http.MethodGet, "http://localhost:5173", nil)
	if rec.Code != 200 || rec.Header().Values("Access-Control-Allow-Origin")[0] != "http://localhost:5173" || len(rec.Header().Values("Access-Control-Allow-Origin")) != 1 {
		t.Fatalf("get: %d %v", rec.Code, rec.Header())
	}
	if rec := do(http.MethodGet, "https://evil.example", nil); rec.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatalf("get evil: %v", rec.Header())
	}
	// CORS を設定していない API は、関数の Access-Control-Allow-Origin をそのまま返す（OPTIONS も関数へ）
	req := httptest.NewRequest(http.MethodGet, "https://shop-apigw-cloud.taramanji.com/x", nil)
	req.Header.Set(service.HeaderFunction, "api")
	req.Header.Set("Origin", "https://evil.example")
	r2 := httptest.NewRecorder()
	inv.ServeHTTP(r2, req)
	if r2.Header().Get("Access-Control-Allow-Origin") != "https://from-function.example" {
		t.Fatalf("passthrough: %v", r2.Header())
	}
	// * はどこからでも
	req = httptest.NewRequest(http.MethodGet, "https://shop-apigw-cloud.taramanji.com/x", nil)
	req.Header.Set(service.HeaderFunction, "api")
	req.Header.Set(service.HeaderCORS, "*")
	req.Header.Set("Origin", "https://anywhere.example")
	r3 := httptest.NewRecorder()
	inv.ServeHTTP(r3, req)
	if r3.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Fatalf("*: %v", r3.Header())
	}
}

func TestCORSOnUnauthorized(t *testing.T) {
	inv, _ := setupEcho(t)
	// ブラウザが 401 を読めるように、エラーにも CORS を付ける
	req := httptest.NewRequest(http.MethodGet, "https://shop-apigw-cloud.taramanji.com/x", nil)
	req.Header.Set(service.HeaderFunction, "api")
	req.Header.Set(service.HeaderAuth, service.AuthAPIKey)
	req.Header.Set(service.HeaderAPIKeys, "-")
	req.Header.Set(service.HeaderCORS, "http://localhost:5173")
	req.Header.Set("Origin", "http://localhost:5173")
	rec := httptest.NewRecorder()
	inv.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized || rec.Header().Get("Access-Control-Allow-Origin") != "http://localhost:5173" {
		t.Fatalf("%d %v", rec.Code, rec.Header())
	}
}
