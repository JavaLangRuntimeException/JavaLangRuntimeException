package argoview

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestTrackingID(t *testing.T) {
	if got := TrackingID("taramanji-cloud-fn-blog", "apps/v1", "Deployment", "taramanji-cloud-fn-blog", "blog"); got != "taramanji-cloud-fn-blog:apps/Deployment:taramanji-cloud-fn-blog/blog" {
		t.Fatal(got)
	}
	if got := TrackingID("a", "v1", "ConfigMap", "taramanji-cloud-apps", "function-blog"); got != "a:/ConfigMap:taramanji-cloud-apps/function-blog" {
		t.Fatal(got)
	}
}

func TestHandler(t *testing.T) {
	list := func(context.Context) ([]string, error) { return []string{"web", "blog"}, nil }
	h := Handler("secret", list)
	call := func(method, auth string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, Path, strings.NewReader(`{"applicationSetName":"x","input":{"parameters":{}}}`))
		if auth != "" {
			r.Header.Set("Authorization", auth)
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w
	}
	if w := call(http.MethodPost, "Bearer secret"); w.Code != 200 || strings.TrimSpace(w.Body.String()) != `{"output":{"parameters":[{"name":"blog"},{"name":"web"}]}}` {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
	for _, auth := range []string{"", "Bearer nope", "secret"} {
		if w := call(http.MethodPost, auth); w.Code != http.StatusUnauthorized {
			t.Fatalf("%q: %d", auth, w.Code)
		}
	}
	if w := call(http.MethodGet, "Bearer secret"); w.Code != http.StatusMethodNotAllowed {
		t.Fatal(w.Code)
	}
	if w := httptest.NewRecorder(); true {
		Handler("", list).ServeHTTP(w, httptest.NewRequest(http.MethodPost, Path, nil))
		if w.Code != http.StatusUnauthorized {
			t.Fatal("空のトークンでは通さない", w.Code)
		}
	}
	fail := Handler("secret", func(context.Context) ([]string, error) { return nil, errors.New("down") })
	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodPost, Path, nil)
	r.Header.Set("Authorization", "Bearer secret")
	fail.ServeHTTP(w, r)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatal(w.Code)
	}
}
