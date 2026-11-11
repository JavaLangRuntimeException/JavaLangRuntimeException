package storage

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

var key = []byte("0123456789abcdef0123456789abcdef")

func newStore(t *testing.T) *Store {
	s, err := New(t.TempDir(), key)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Reconcile([]string{"site", "data", "Bad_Name"}); err != nil {
		t.Fatal(err)
	}
	return s
}

func do(t *testing.T, h http.Handler, method, target, token, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, target, strings.NewReader(body))
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestObjects(t *testing.T) {
	s := newStore(t)
	h, tok := s.Handler(), Token(key, "site")
	if rec := do(t, h, "PUT", "/b/site/index.html", tok, "<h1>hi</h1>"); rec.Code != http.StatusNoContent {
		t.Fatalf("put: %d %s", rec.Code, rec.Body)
	}
	if rec := do(t, h, "PUT", "/b/site/assets/app.js", tok, "x"); rec.Code != http.StatusNoContent {
		t.Fatal(rec.Code)
	}
	rec := do(t, h, "GET", "/b/site/index.html", tok, "")
	if rec.Code != 200 || rec.Body.String() != "<h1>hi</h1>" || !strings.HasPrefix(rec.Header().Get("Content-Type"), "text/html") || rec.Header().Get("ETag") == "" {
		t.Fatalf("get: %d %v", rec.Code, rec.Header())
	}
	// 拡張子のないものは、中身から種類を推測させない
	do(t, h, "PUT", "/b/site/raw", tok, "<script>")
	if ct := do(t, h, "GET", "/b/site/raw", tok, "").Header().Get("Content-Type"); ct != "application/octet-stream" {
		t.Fatal(ct)
	}
	if rec := do(t, h, "GET", "/b/site?prefix=assets/", tok, ""); !strings.Contains(rec.Body.String(), `"key":"assets/app.js"`) || strings.Contains(rec.Body.String(), "index.html") {
		t.Fatalf("list: %s", rec.Body)
	}
	if rec := do(t, h, "DELETE", "/b/site/assets/app.js", tok, ""); rec.Code != http.StatusNoContent {
		t.Fatal(rec.Code)
	}
	if _, err := os.Stat(filepath.Join(s.dir, "site", objectsDir, "assets")); !os.IsNotExist(err) {
		t.Fatal("空になった途中のディレクトリも消す")
	}
	if rec := do(t, h, "DELETE", "/b/site/assets/app.js", tok, ""); rec.Code != http.StatusNotFound {
		t.Fatal(rec.Code)
	}
}

func TestAuth(t *testing.T) {
	s := newStore(t)
	h := s.Handler()
	for name, tok := range map[string]string{"なし": "", "別のバケット": Token(key, "data"), "でたらめ": "x"} {
		if rec := do(t, h, "GET", "/b/site/index.html", tok, ""); rec.Code != http.StatusUnauthorized {
			t.Errorf("%s: %d", name, rec.Code)
		}
	}
	// ないバケットは、トークンが違うときと同じ応答
	if rec := do(t, h, "GET", "/b/none/x", Token(key, "none"), ""); rec.Code != http.StatusNotFound {
		t.Errorf("ないバケット: %d", rec.Code)
	}
	// 管理用のトークンは全バケットと、バケットの一覧を扱える
	admin := Token(key, "*")
	do(t, h, "PUT", "/b/data/a.txt", admin, "abc")
	if rec := do(t, h, "GET", "/b/", admin, ""); !strings.Contains(rec.Body.String(), `{"name":"data","objects":1,"bytes":3}`) {
		t.Fatalf("buckets: %s", rec.Body)
	}
	if rec := do(t, h, "GET", "/b/", Token(key, "site"), ""); rec.Code != http.StatusUnauthorized {
		t.Fatal("バケットのトークンでは一覧を見られない")
	}
}

func TestKeysCannotEscape(t *testing.T) {
	s := newStore(t)
	for _, k := range []string{"", "/a", "a/", "a//b", "../x", "a/../../x", "a/./b", "a\\b", strings.Repeat("a", 1025)} {
		if ValidKey(k) {
			t.Errorf("%q は使えない", k)
		}
		if err := s.Put("site", k, strings.NewReader("x")); err == nil {
			t.Errorf("%q を置けてしまう", k)
		}
	}
	// 途中の区切りと同じ名前のオブジェクトがあるときは置けない
	if err := s.Put("site", "a", strings.NewReader("x")); err != nil {
		t.Fatal(err)
	}
	if err := s.Put("site", "a/b", strings.NewReader("x")); err == nil {
		t.Fatal("a があるのに a/b を置けてしまう")
	}
	// バケットの外を指すシンボリックリンクがあっても、外は読めない
	outside := filepath.Join(t.TempDir(), "secret")
	_ = os.WriteFile(outside, []byte("secret"), 0o600)
	_ = os.Symlink(outside, filepath.Join(s.dir, "site", objectsDir, "link"))
	if rec := do(t, s.PublicHandler(), "GET", "/site/link", "", ""); rec.Code != http.StatusNotFound {
		t.Fatalf("シンボリックリンクの先を読めてしまう: %d %s", rec.Code, rec.Body)
	}
}

func TestSizeLimitAndPublic(t *testing.T) {
	s := newStore(t)
	s.MaxObjectBytes = 4
	if err := s.Put("site", "big", strings.NewReader("12345")); err != errTooLarge {
		t.Fatalf("上限: %v", err)
	}
	if objs, _, _ := s.List("site", ""); len(objs) != 0 {
		t.Fatal("書きかけを残さない")
	}
	_ = s.Put("site", "ok.txt", strings.NewReader("1234"))
	pub := s.PublicHandler()
	if rec := do(t, pub, "GET", "/site/ok.txt", "", ""); rec.Code != 200 || rec.Body.String() != "1234" {
		t.Fatalf("public: %d", rec.Code)
	}
	if rec := do(t, pub, "PUT", "/site/ok.txt", Token(key, "*"), "x"); rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("読むだけのポートでは置けない: %d", rec.Code)
	}
	req := httptest.NewRequest("GET", "/site/ok.txt", nil)
	req.Header.Set("Range", "bytes=1-2")
	rec := httptest.NewRecorder()
	pub.ServeHTTP(rec, req)
	if b, _ := io.ReadAll(rec.Body); rec.Code != http.StatusPartialContent || string(b) != "23" {
		t.Fatalf("range: %d %s", rec.Code, b)
	}
}

func TestReconcileKeepsNonEmptyBuckets(t *testing.T) {
	s := newStore(t)
	_ = s.Put("data", "keep.txt", strings.NewReader("x"))
	if err := s.Reconcile(nil); err != nil {
		t.Fatal(err)
	}
	buckets, _ := s.Buckets()
	if len(buckets) != 1 || buckets[0].Name != "data" {
		t.Fatalf("空のバケットだけ消す: %+v", buckets)
	}
}
