package service

import (
	"strings"
	"testing"
)

func TestQueries(t *testing.T) {
	qs := Queries(MetricsScope{Cluster: "taramanji-kind", Namespaces: []string{"cloud", "cloud-hosting"}, Gateway: "cloud",
		APMEnv: "prod", APMServices: []string{"cloud-api"}})
	byID := map[string]MetricQuery{}
	for _, q := range qs {
		byID[q.ID] = q
	}
	if len(byID) != 5 {
		t.Fatalf("queries %v", qs)
	}
	if !strings.Contains(byID["requests"].Query, "(envoy_cluster_name:httproute/cloud/* OR envoy_cluster_name:httproute/cloud-hosting/*)") ||
		!strings.Contains(byID["requests"].Query, "gateway:cloud") {
		t.Fatal(byID["requests"].Query)
	}
	// 本番の taramanji の namespace は含めない
	if strings.Contains(byID["cpu"].Query, "kube_namespace:taramanji") || !strings.Contains(byID["cpu"].Query, "kube_namespace:cloud OR") {
		t.Fatal(byID["cpu"].Query)
	}
	if byID["latency_p95"].Query != "p95:trace.http.server.request{env:prod AND service:cloud-api} by {service}" {
		t.Fatal(byID["latency_p95"].Query)
	}
}

func TestGroupLabel(t *testing.T) {
	cases := []struct {
		tag  string
		tags []string
		want string
	}{
		{"envoy_cluster_name", []string{"envoy_cluster_name:httproute/cloud/console/rule/1"}, "cloud/console"},
		{"kube_deployment", []string{"kube_namespace:cloud", "kube_deployment:cloud-api"}, "cloud-api"},
		{"", []string{"x:y"}, ""},
		{"service", nil, ""},
	}
	for _, c := range cases {
		if got := GroupLabel(c.tag, c.tags); got != c.want {
			t.Errorf("%v: %q", c.tags, got)
		}
	}
}

func TestVersion(t *testing.T) {
	for image, want := range map[string]string{
		"ghcr.io/javalangruntimeexception/taramanji-cloud:sha-abc1234": "sha-abc1234",
		"redis:8.2-alpine@sha256:0123":                                 "8.2-alpine",
		"localhost:5001/console":                                       "latest",
		"nginx":                                                        "latest",
	} {
		if got := Version(image); got != want {
			t.Errorf("%s: %q", image, got)
		}
	}
}
