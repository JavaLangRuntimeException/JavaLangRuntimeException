package invoker

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestLimit(t *testing.T) {
	calls := 0
	h := Limit(RateLimit{PerSecond: 1, Burst: 2}, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls++
		w.WriteHeader(http.StatusOK)
	}), func(r *http.Request) bool { return r.Header.Get("X-Skip") == "1" })
	send := func(ip string) int {
		r := httptest.NewRequest(http.MethodGet, "https://x-apigw-cloud.taramanji.com/", nil)
		r.Header.Set(ClientIPHeader, ip)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code == http.StatusTooManyRequests && w.Header().Get("Retry-After") != "1" {
			t.Fatal("Retry-After がない")
		}
		return w.Code
	}
	if send("198.51.100.1") != 200 || send("198.51.100.1") != 200 || send("198.51.100.1") != http.StatusTooManyRequests {
		t.Fatal("Burst を超えたら 429")
	}
	// ほかの IP は別に数える。止めたリクエストは関数に渡さない
	if send("198.51.100.2") != 200 || calls != 3 {
		t.Fatalf("calls %d", calls)
	}
	// skip のもの（CDN から渡し直した 2 回目）は数えない
	r := httptest.NewRequest(http.MethodGet, "https://x-apigw-cloud.taramanji.com/", nil)
	r.Header.Set(ClientIPHeader, "198.51.100.1")
	r.Header.Set("X-Skip", "1")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatalf("skip: %d", w.Code)
	}
}
