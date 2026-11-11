package gateway

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
)

// GitHub の Contents API のまね（prod/ の下だけ）
func fakeGitHub(t *testing.T, files map[string]string) *httptest.Server {
	sha := func(name string) string { return "sha-" + name + "-" + files[name] }
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer tok" {
			t.Errorf("token がない: %s", r.URL.Path)
		}
		name := strings.TrimPrefix(r.URL.Path, "/repos/me/apps/contents/prod")
		name = strings.TrimPrefix(name, "/")
		var in struct{ Content, SHA, Branch string }
		_ = json.NewDecoder(r.Body).Decode(&in)
		switch {
		case r.Method == http.MethodGet && name == "":
			if len(files) == 0 {
				w.WriteHeader(http.StatusNotFound)
				return
			}
			list := []map[string]string{{"name": "README.md", "type": "file"}}
			for n := range files {
				list = append(list, map[string]string{"name": n, "type": "file"})
			}
			_ = json.NewEncoder(w).Encode(list)
		case r.Method == http.MethodGet:
			if _, ok := files[name]; !ok {
				w.WriteHeader(http.StatusNotFound)
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]string{"sha": sha(name), "encoding": "base64",
				"content": base64.StdEncoding.EncodeToString([]byte(files[name]))})
		case r.Method == http.MethodPut:
			if _, ok := files[name]; ok && in.SHA != sha(name) {
				w.WriteHeader(http.StatusConflict)
				return
			}
			raw, _ := base64.StdEncoding.DecodeString(in.Content)
			files[name] = string(raw)
			_ = json.NewEncoder(w).Encode(map[string]any{"content": map[string]string{"sha": sha(name)}})
		case r.Method == http.MethodDelete:
			if in.SHA != sha(name) {
				w.WriteHeader(http.StatusConflict)
				return
			}
			delete(files, name)
			_, _ = w.Write([]byte("{}"))
		}
	}))
}

func TestGitHubAppStore(t *testing.T) {
	files := map[string]string{}
	srv := fakeGitHub(t, files)
	defer srv.Close()
	store, err := NewGitHubAppStore(GitHubConfig{API: srv.URL, Repo: "me/apps", Branch: "main", Dir: "prod", Token: "tok"})
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	if list, err := store.List(ctx); err != nil || len(list) != 0 {
		t.Fatalf("ディレクトリがなければ空: %v %v", list, err)
	}
	if _, err := store.Get(ctx, "blog"); !errors.Is(err, gateway.ErrAppNotFound) {
		t.Fatalf("not found: %v", err)
	}
	rev, err := store.Put(ctx, "blog", "a: 1\n", "", "create")
	if err != nil || rev == "" || files["blog.yaml"] != "a: 1\n" {
		t.Fatalf("put: %q %v", rev, err)
	}
	if _, err := store.Put(ctx, "blog", "a: 2\n", "stale", "update"); !errors.Is(err, gateway.ErrAppConflict) {
		t.Fatalf("古い版: %v", err)
	}
	list, err := store.List(ctx)
	if err != nil || len(list) != 1 || list[0].Name != "blog" || list[0].YAML != "a: 1\n" || list[0].Revision != rev {
		t.Fatalf("list（.yaml 以外は飛ばす）: %+v %v", list, err)
	}
	if err := store.Delete(ctx, "blog", "stale", "delete"); !errors.Is(err, gateway.ErrAppConflict) {
		t.Fatalf("古い版では消せない: %v", err)
	}
	if err := store.Delete(ctx, "blog", rev, "delete"); err != nil || len(files) != 0 {
		t.Fatalf("delete: %v", err)
	}
	if got := store.URL("blog"); got != "https://github.com/me/apps/blob/main/prod/blog.yaml" {
		t.Fatal(got)
	}
	if _, err := NewGitHubAppStore(GitHubConfig{Repo: "../x", Branch: "main", Dir: "prod", Token: "tok"}); err == nil {
		t.Fatal("リポジトリ名を確かめる")
	}
}
