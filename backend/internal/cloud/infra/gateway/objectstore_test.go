package gateway

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

// コンソールからのアップロード・ダウンロードは ReverseProxy でストレージに渡す。
// STORAGE_URL にパスがなくても、ストレージに届くパスは /b/<バケット>/<キー> になる（先頭の / が抜けると 400 で切られていた）
func TestObjectProxyPath(t *testing.T) {
	type seen struct{ method, uri, auth, cookie, body string }
	got := make(chan seen, 1)
	storage := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		got <- seen{r.Method, r.RequestURI, r.Header.Get("Authorization"), r.Header.Get("Cookie"), string(b)}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer storage.Close()

	for _, base := range []string{storage.URL, storage.URL + "/"} {
		objs, err := NewObjectStore(base, "tok")
		if err != nil {
			t.Fatal(err)
		}
		front := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			objs.Proxy(w, r, "site", "assets/日本語 1.png")
		}))
		req, _ := http.NewRequest(http.MethodPut, front.URL+"/_objects/x", bytes.NewReader([]byte("hello")))
		req.Header.Set("Cookie", "CF_Authorization=secret")
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		front.Close()
		var s seen
		select {
		case s = <-got:
		default:
			t.Fatalf("%s: ストレージに届いていない（%d）", base, res.StatusCode)
		}
		if res.StatusCode != http.StatusNoContent || s.method != http.MethodPut || s.body != "hello" {
			t.Fatalf("%s: %d %+v", base, res.StatusCode, s)
		}
		if s.uri != "/b/site/assets/%E6%97%A5%E6%9C%AC%E8%AA%9E%201.png" {
			t.Fatalf("%s: パス %q", base, s.uri)
		}
		// ストレージにはストレージのトークンだけを渡し、利用者の Cookie は渡さない
		if s.auth != "Bearer tok" || s.cookie != "" {
			t.Fatalf("%s: auth %q cookie %q", base, s.auth, s.cookie)
		}
	}
}
