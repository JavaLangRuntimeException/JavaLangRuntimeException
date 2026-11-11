package gateway

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCloudflareAccess(t *testing.T) {
	const account = "f952fdc8cd122331a587b1ff4fdac99d"
	apps := map[string]accessApp{
		"tpl":   {ID: "tpl", Name: TemplateAccessApp, AllowedIDPs: []string{"google"}, AutoRedirectToIdentity: true, SessionDuration: "24h", Policies: []accessPolicyRef{{ID: "admins", Precedence: 1}}},
		"admin": {ID: "admin", Name: "taramanji-admin", Destinations: []accessDestination{{Type: "public", URI: "taramanji.com/admin"}}},
	}
	var calls []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer tok" || !strings.HasPrefix(r.URL.Path, "/accounts/"+account+"/access/apps") {
			t.Errorf("bad request %s %s", r.Method, r.URL.Path)
		}
		id := strings.TrimPrefix(strings.TrimPrefix(r.URL.Path, "/accounts/"+account+"/access/apps"), "/")
		calls = append(calls, r.Method+" "+id)
		switch r.Method {
		case http.MethodGet:
			out := []accessApp{}
			for _, a := range apps {
				out = append(out, a)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"result": out})
			return
		case http.MethodPost, http.MethodPut:
			var a accessApp
			_ = json.NewDecoder(r.Body).Decode(&a)
			if id == "" {
				id = "new"
			}
			a.ID = id
			apps[id] = a
		case http.MethodDelete:
			delete(apps, id)
		}
		_, _ = w.Write([]byte(`{"result":{}}`))
	}))
	defer srv.Close()
	acc, err := NewCloudflareAccess(CloudflareAccessConfig{API: srv.URL, Token: "tok", AccountID: account})
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	// 作る: ログインの方法とポリシーは taramanji-cloud-apps と同じ
	if err := acc.SetHosts(ctx, []string{"docs.taramanji.com", "qa.taramanji.com"}); err != nil {
		t.Fatal(err)
	}
	got := apps["new"]
	if got.Name != DomainsAccessApp || got.Domain != "docs.taramanji.com" || len(got.Destinations) != 2 || got.Destinations[1].URI != "qa.taramanji.com" ||
		len(got.Policies) != 1 || got.Policies[0].ID != "admins" || got.AllowedIDPs[0] != "google" || !got.AutoRedirectToIdentity {
		t.Fatalf("app: %+v", got)
	}
	// 変える: 同じアプリを PUT（ほかのアプリには触れない）
	if err := acc.SetHosts(ctx, []string{"qa.taramanji.com"}); err != nil || len(apps["new"].Destinations) != 1 {
		t.Fatalf("update: %v %+v", err, apps["new"])
	}
	// 空なら消す
	if err := acc.SetHosts(ctx, nil); err != nil {
		t.Fatal(err)
	}
	if _, ok := apps["new"]; ok {
		t.Fatal("空なのにアプリが残っている")
	}
	if _, ok := apps["admin"]; !ok || len(apps) != 2 {
		t.Fatalf("ほかのアプリに触れてしまう: %v", apps)
	}
	for _, c := range calls {
		if strings.HasSuffix(c, " admin") || strings.HasSuffix(c, " tpl") {
			t.Fatalf("ほかのアプリを変えている: %v", calls)
		}
	}
	// 元のアプリがなければ作らない（ログインなしで公開してしまわないように）
	delete(apps, "tpl")
	if err := acc.SetHosts(ctx, []string{"qa.taramanji.com"}); err == nil {
		t.Fatal("元のアプリがないのに作れてしまう")
	}
}
