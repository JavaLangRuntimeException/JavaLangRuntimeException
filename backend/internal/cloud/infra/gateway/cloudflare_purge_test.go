package gateway

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCloudflarePurge(t *testing.T) {
	const zone = "0123456789abcdef0123456789abcdef"
	var bodies []map[string][]string
	status := http.StatusOK
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer tok" || r.URL.Path != "/zones/"+zone+"/purge_cache" || r.Method != http.MethodPost {
			t.Errorf("bad request %s %s", r.Method, r.URL.Path)
		}
		var b map[string][]string
		_ = json.NewDecoder(r.Body).Decode(&b)
		bodies = append(bodies, b)
		w.WriteHeader(status)
		_, _ = w.Write([]byte(`{"success":true,"result":{}}`))
	}))
	defer srv.Close()
	p, err := NewCloudflarePurge(CloudflarePurgeConfig{API: srv.URL, Token: "tok", ZoneID: zone, HostSuffix: "-cloud.taramanji.com", AliasZone: "taramanji.com"})
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	if err := p.PurgeHosts(ctx, []string{"site-storage-cloud.taramanji.com", "qa.taramanji.com"}); err != nil || len(bodies[0]["hosts"]) != 2 {
		t.Fatalf("hosts: %v %v", err, bodies)
	}
	// 100 個ずつ送る
	urls := []string{}
	for i := range 150 {
		urls = append(urls, fmt.Sprintf("https://vrst-cdn-cloud.taramanji.com/%d.png", i))
	}
	bodies = nil
	if err := p.PurgeURLs(ctx, urls); err != nil || len(bodies) != 2 || len(bodies[0]["files"]) != 100 || len(bodies[1]["files"]) != 50 {
		t.Fatalf("files: %v %d", err, len(bodies))
	}
	// taramanji.com 本体・2 階層・よその URL は消さない（送らない）
	bodies = nil
	for _, h := range []string{"taramanji.com", "www.gws.taramanji.com", "example.com", "*.taramanji.com"} {
		if err := p.PurgeHosts(ctx, []string{h}); err == nil {
			t.Errorf("%s を消してしまう", h)
		}
	}
	if err := p.PurgeURLs(ctx, []string{"https://example.com/x"}); err == nil {
		t.Error("よその URL を消してしまう")
	}
	if len(bodies) != 0 {
		t.Fatalf("送ってしまった: %v", bodies)
	}
	// 権限がない・多すぎるときは、わかる理由を返す
	status = http.StatusForbidden
	if err := p.PurgeHosts(ctx, []string{"site-storage-cloud.taramanji.com"}); err == nil || !strings.Contains(err.Error(), "Cache Purge") {
		t.Fatalf("403: %v", err)
	}
	status = http.StatusTooManyRequests
	if err := p.PurgeHosts(ctx, []string{"site-storage-cloud.taramanji.com"}); err == nil || !strings.Contains(err.Error(), "1 分に 5 回") {
		t.Fatalf("429: %v", err)
	}
}
