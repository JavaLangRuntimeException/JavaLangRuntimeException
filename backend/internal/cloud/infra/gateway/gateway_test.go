package gateway

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestKubeWorkloads(t *testing.T) {
	var auth, query string
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth, query = r.Header.Get("Authorization"), r.URL.RawQuery
		switch r.URL.Path {
		case "/apis/apps/v1/namespaces/cloud/deployments":
			_, _ = w.Write([]byte(`{"items":[{"metadata":{"name":"cloud-api"},"spec":{"replicas":2,"template":{"spec":{"containers":[{"image":"ghcr.io/x/taramanji-cloud:sha-1"}]}}},"status":{"readyReplicas":1}}]}`))
		case "/apis/apps/v1/namespaces/cloud/statefulsets":
			_, _ = w.Write([]byte(`{"items":[{"metadata":{"name":"redis"},"spec":{"template":{"spec":{"containers":[{"image":"redis:8"}]}}},"status":{}}]}`))
		default:
			http.Error(w, `{"message":"forbidden"}`, http.StatusForbidden)
		}
	}))
	defer srv.Close()
	token := filepath.Join(t.TempDir(), "token")
	_ = os.WriteFile(token, []byte("tok\n"), 0o600)
	k := &kube{http: srv.Client(), base: srv.URL, namespace: "cloud", tokenPath: token}
	ws, err := k.Workloads(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if auth != "Bearer tok" || query != "labelSelector=app.kubernetes.io%2Fpart-of%3Dtaramanji-cloud" {
		t.Fatalf("auth %q query %q", auth, query)
	}
	if len(ws) != 2 || ws[0].Desired != 2 || ws[0].Ready != 1 || ws[1].Name != "redis" || ws[1].Desired != 1 {
		t.Fatalf("%+v", ws)
	}
	k.namespace = "taramanji"
	if _, err := k.Workloads(context.Background()); err == nil {
		t.Fatal("expected forbidden")
	}
}

func TestDatadogQuery(t *testing.T) {
	var keys [2]string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		keys = [2]string{r.Header.Get("DD-API-KEY"), r.Header.Get("DD-APPLICATION-KEY")}
		if r.URL.Query().Get("query") == "bad" {
			_, _ = w.Write([]byte(`{"status":"error","error":"Rule parse error"}`))
			return
		}
		_, _ = w.Write([]byte(`{"status":"ok","series":[{"tag_set":["kube_deployment:console"],"pointlist":[[1000,1.5],[2000,null],[3000,2.5]]}]}`))
	}))
	defer srv.Close()
	d := NewDatadog(srv.URL, "api", "app")
	s, err := d.Query(context.Background(), "sum:x{*}", time.Unix(0, 0), time.Unix(60, 0))
	if err != nil || keys != [2]string{"api", "app"} {
		t.Fatalf("%v %v", err, keys)
	}
	if len(s) != 1 || len(s[0].Values) != 2 || s[0].TimestampsMs[1] != 3000 || s[0].Tags[0] != "kube_deployment:console" {
		t.Fatalf("%+v", s)
	}
	if _, err := d.Query(context.Background(), "bad", time.Unix(0, 0), time.Unix(60, 0)); err == nil {
		t.Fatal("expected error")
	}
}
