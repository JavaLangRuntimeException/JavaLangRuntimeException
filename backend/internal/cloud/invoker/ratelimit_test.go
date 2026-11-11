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
	}))
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
}
