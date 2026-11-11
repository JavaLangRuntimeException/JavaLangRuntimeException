package gateway

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
)

func TestParseQuantity(t *testing.T) {
	cases := []struct {
		in    string
		scale float64
		want  int64
	}{
		{"", 1, 0},
		{"12304172Ki", 1, 12304172 * 1024},
		{"2560Mi", 1, 2560 << 20},
		{"1.5Gi", 1, 3 << 29},
		{"100M", 1, 100_000_000},
		{"950m", 1000, 950},
		{"10", 1000, 10_000},
		{"0.25", 1000, 250},
		{"260123456n", 1000, 260},
		{"1e3", 1, 1000},
		{"1E", 1, 1e18},
		{"30", 1, 30},
	}
	for _, c := range cases {
		got, err := parseQuantity(c.in, c.scale)
		if err != nil || got != c.want {
			t.Errorf("parseQuantity(%q, %v) = %d, %v; want %d", c.in, c.scale, got, err, c.want)
		}
	}
	for _, bad := range []string{"abc", "1Xi", "1.2.3"} {
		if _, err := parseQuantity(bad, 1); err == nil {
			t.Errorf("parseQuantity(%q) should fail", bad)
		}
	}
}

func testKube(t *testing.T, routes map[string]string) *Kube {
	t.Helper()
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, ok := routes[r.URL.Path]
		if !ok {
			http.Error(w, `{"message":"not found"}`, http.StatusNotFound)
			return
		}
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	token := filepath.Join(t.TempDir(), "token")
	_ = os.WriteFile(token, []byte("tok"), 0o600)
	return &Kube{http: srv.Client(), base: srv.URL, namespace: "cloud", appsNamespace: "cloud-apps", tokenPath: token}
}

func TestKubeCapacity(t *testing.T) {
	k := testKube(t, map[string]string{
		// 関数ごとの namespace（コントローラーが作ったもの）。名前の決まりに合わないものは見ない
		"/api/v1/namespaces": `{"items":[
			{"metadata":{"name":"cloud-fn-web","labels":{"cloud.taramanji.com/function":"web"}}},
			{"metadata":{"name":"hand-made","labels":{"cloud.taramanji.com/function":"x"}}}]}`,
		"/api/v1/namespaces/cloud-fn-web/pods": `{"items":[
			{"metadata":{"name":"web-1"},"spec":{"containers":[{"resources":{"limits":{"memory":"256Mi","cpu":"250m"}}}]},"status":{"phase":"Running"}},
			{"metadata":{"name":"job-1"},"spec":{"containers":[{"resources":{"limits":{"memory":"128Mi"}}}]},"status":{"phase":"Succeeded"}}]}`,
		"/apis/metrics.k8s.io/v1beta1/namespaces/cloud-fn-web/pods": `{"items":[
			{"metadata":{"name":"web-1"},"containers":[{"usage":{"memory":"100Mi","cpu":"12345678n"}}]}]}`,
		"/apis/apps/v1/namespaces/cloud-fn-web/deployments":     `{"items":[{"metadata":{"name":"web"},"spec":{"replicas":1},"status":{"readyReplicas":1}}]}`,
		"/apis/apps/v1/namespaces/cloud-fn-web/deployments/web": `{"metadata":{"name":"web"},"spec":{"replicas":1,"template":{"spec":{"containers":[{"resources":{"limits":{"memory":"256Mi"}}}]}}},"status":{"readyReplicas":1}}`,
		"/api/v1/nodes": `{"items":[
			{"metadata":{"name":"n1"},"status":{"capacity":{"memory":"12304172Ki","cpu":"10"}}},
			{"metadata":{"name":"n2"},"status":{"capacity":{"memory":"12304172Ki","cpu":"10"}}}]}`,
		"/apis/metrics.k8s.io/v1beta1/nodes": `{"items":[
			{"metadata":{"name":"n1"},"usage":{"memory":"1Gi","cpu":"120m"}},
			{"metadata":{"name":"n2"},"usage":{"memory":"2Gi","cpu":"240m"}}]}`,
	})
	k.WithFunctions("prod", gateway.Resources{MemoryBytes: 2560 << 20, CPUMillis: 4000, Pods: 30})
	ctx := context.Background()
	q, err := k.AppQuota(ctx)
	if err != nil || !q.Found || q.Hard.MemoryBytes != 2560<<20 || q.Hard.CPUMillis != 4000 || q.Hard.Pods != 30 ||
		q.Used.MemoryBytes != 256<<20 || q.Used.CPUMillis != 250 || q.Used.Pods != 1 {
		t.Fatalf("quota %+v %v", q, err)
	}
	pods, err := k.AppPods(ctx)
	if err != nil || len(pods) != 1 || pods[0].Name != "web/web-1" || pods[0].MemoryUsed != 100<<20 || pods[0].MemoryLimit != 256<<20 || pods[0].CPUUsed != 12 {
		t.Fatalf("pods %+v %v", pods, err)
	}
	ws, err := k.AppWorkloads(ctx)
	if err != nil || len(ws) != 1 || ws[0].Name != "web" {
		t.Fatalf("workloads %+v %v", ws, err)
	}
	running, err := k.Running(ctx)
	if err != nil || len(running) != 1 || running[0].Name != "web" || running[0].MemoryBytes != 256<<20 {
		t.Fatalf("running %+v %v", running, err)
	}
	nodes, err := k.Nodes(ctx)
	if err != nil || len(nodes) != 2 || nodes[1].MemoryCapacity != 12304172*1024 || nodes[1].CPUCapacity != 10000 || nodes[1].MemoryUsed != 2<<30 || nodes[1].CPUUsed != 240 {
		t.Fatalf("nodes %+v %v", nodes, err)
	}
}
