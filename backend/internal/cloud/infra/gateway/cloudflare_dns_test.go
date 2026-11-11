package gateway

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCloudflareDNS(t *testing.T) {
	const zone, tunnel = "0123456789abcdef0123456789abcdef", "01234567-89ab-cdef-0123-456789abcdef"
	records := map[string]dnsRecord{"other": {ID: "other", Type: "A", Name: "taken-cloud.taramanji.com", Content: "192.0.2.1"},
		"manual": {ID: "manual", Type: "CNAME", Name: "manual-cloud.taramanji.com", Content: tunnel + ".cfargotunnel.com"}}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer tok" || !strings.HasPrefix(r.URL.Path, "/zones/"+zone+"/dns_records") {
			t.Errorf("bad request: %s", r.URL.Path)
		}
		switch r.Method {
		case http.MethodGet:
			out := []dnsRecord{}
			for _, rec := range records {
				if rec.Name == r.URL.Query().Get("name") {
					out = append(out, rec)
				}
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"result": out})
		case http.MethodPost:
			var rec dnsRecord
			_ = json.NewDecoder(r.Body).Decode(&rec)
			rec.ID = "new"
			records["new"] = rec
			_, _ = w.Write([]byte(`{"result":{}}`))
		case http.MethodDelete:
			delete(records, r.URL.Path[strings.LastIndex(r.URL.Path, "/")+1:])
			_, _ = w.Write([]byte(`{"result":{}}`))
		}
	}))
	defer srv.Close()
	dns, err := NewCloudflareDNS(CloudflareDNSConfig{API: srv.URL, Token: "tok", ZoneID: zone, TunnelID: tunnel, HostSuffix: "-cloud.taramanji.com"})
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	if err := dns.Ensure(ctx, "shop-cloud.taramanji.com"); err != nil {
		t.Fatal(err)
	}
	if r := records["new"]; r.Type != "CNAME" || r.Content != tunnel+".cfargotunnel.com" || !r.Proxied || r.Comment != dnsComment {
		t.Fatalf("record: %+v", r)
	}
	if err := dns.Ensure(ctx, "shop-cloud.taramanji.com"); err != nil || len(records) != 3 {
		t.Fatalf("2 回目は何もしない: %v %d", err, len(records))
	}
	if err := dns.Ensure(ctx, "taken-cloud.taramanji.com"); err == nil {
		t.Fatal("別のレコードがあるホスト名は上書きしない")
	}
	// taramanji.com 本体や、接尾辞の違うホスト名には触れない
	for _, h := range []string{"taramanji.com", "www.taramanji.com", "a.b-cloud.taramanji.com", "x-cloud.taramanji.com.evil.example"} {
		if err := dns.Ensure(ctx, h); err == nil {
			t.Errorf("%s は扱わない", h)
		}
	}
	// 手で作ったレコード（印がない）は消さない。自分が作ったものだけ消す
	if err := dns.Remove(ctx, "manual-cloud.taramanji.com"); err != nil || len(records) != 3 {
		t.Fatalf("手で作ったものは残す: %v", err)
	}
	if err := dns.Remove(ctx, "shop-cloud.taramanji.com"); err != nil || len(records) != 2 {
		t.Fatalf("remove: %v %d", err, len(records))
	}
}
