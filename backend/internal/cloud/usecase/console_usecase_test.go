package usecase

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/service"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/cfaccess"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/errs"
)

type fakeCluster []gateway.Workload

func (f fakeCluster) Workloads(context.Context) ([]gateway.Workload, error) { return f, nil }

type fakeMetrics struct {
	mu      sync.Mutex
	queries []string
	from    time.Time
	fail    string
}

func (f *fakeMetrics) Query(_ context.Context, q string, from, _ time.Time) ([]gateway.Series, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.queries = append(f.queries, q)
	f.from = from
	if f.fail != "" && strings.Contains(q, f.fail) {
		return nil, errors.New("HTTP 403: Forbidden")
	}
	return []gateway.Series{{Tags: []string{"kube_deployment:cloud-api", "service:cloud-api"}, TimestampsMs: []int64{1, 2}, Values: []float64{2e6, 4e6}}}, nil
}

var now = time.Date(2026, 10, 22, 12, 0, 0, 0, time.UTC)

func newUC(m gateway.Metrics) *ConsoleUsecaseImpl {
	d := Deps{Environment: "prod", StorageHostSuffix: "-storage.taramanji.com", HostingHostSuffix: "-hosting.taramanji.com",
		Cluster: fakeCluster{
			{Name: "console", Ready: 2, Desired: 2, Image: "ghcr.io/javalangruntimeexception/taramanji-console:v0.3.0"},
			{Name: "cloud-api", Ready: 1, Desired: 2, Image: "ghcr.io/javalangruntimeexception/taramanji-cloud:sha-abc1234"},
		},
		MetricsScope: service.MetricsScope{Cluster: "taramanji-kind", Namespaces: []string{"cloud"}, Gateway: "cloud", APMEnv: "prod", APMServices: []string{"cloud-api"}},
		Clock:        func() time.Time { return now }}
	if m != nil {
		d.Metrics = m
	}
	return NewConsoleUsecase(d)
}

func code(err error) string {
	if de, ok := errs.As(err); ok {
		return de.Code
	}
	return ""
}

func TestGetOverview(t *testing.T) {
	ctx := cfaccess.WithEmail(context.Background(), "owner@example.com")
	out, err := newUC(nil).GetOverview(ctx, GetOverviewInput{})
	if err != nil {
		t.Fatal(err)
	}
	if out.Email != "owner@example.com" || out.MetricsEnabled || len(out.Components) != 2 ||
		out.Components[0].Name != "cloud-api" || out.Components[0].Version != "sha-abc1234" || out.Components[1].Ready != 2 {
		t.Fatalf("%+v %+v", out, out.Components[0])
	}
	out, _ = newUC(&fakeMetrics{}).GetOverview(ctx, GetOverviewInput{})
	if !out.MetricsEnabled {
		t.Fatal("metrics should be enabled")
	}
}

func TestGetMetrics(t *testing.T) {
	ctx := context.Background()
	if _, err := newUC(nil).GetMetrics(ctx, GetMetricsInput{Range: "1h"}); code(err) != "metrics_disabled" {
		t.Fatalf("disabled: %v", err)
	}
	m := &fakeMetrics{}
	if _, err := newUC(m).GetMetrics(ctx, GetMetricsInput{Range: "30d"}); code(err) != "invalid_range" || len(m.queries) != 0 {
		t.Fatalf("range: %v", err)
	}
	out, err := newUC(m).GetMetrics(ctx, GetMetricsInput{Range: "1d"})
	if err != nil || len(out.Series) != 5 || !m.from.Equal(now.Add(-24*time.Hour)) {
		t.Fatalf("out %+v err %v from %v", out, err, m.from)
	}
	// 結果の並びは問い合わせの順。CPU はナノコアからミリコアに直し、デプロイ名で分ける
	cpu := out.Series[3]
	if cpu.Metric != "cpu" || cpu.Group != "cloud-api" || cpu.Values[1] != 4 || cpu.Unit != "mcores" {
		t.Fatalf("cpu %+v", cpu)
	}
	if out.Series[1].Group != "" {
		t.Fatalf("5xx ratio is a single series: %+v", out.Series[1])
	}
}

func TestGetMetricsUpstreamError(t *testing.T) {
	_, err := newUC(&fakeMetrics{fail: "container.memory"}).GetMetrics(context.Background(), GetMetricsInput{Range: "1h"})
	de, ok := errs.As(err)
	if !ok || de.Code != "metrics_upstream" || de.Type != errs.ErrorTypeUpstream || !strings.Contains(de.Detail, "403") {
		t.Fatalf("%v", err)
	}
}
