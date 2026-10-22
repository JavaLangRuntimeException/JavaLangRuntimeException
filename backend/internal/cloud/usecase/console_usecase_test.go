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

type fakeCapacity struct {
	quota gateway.QuotaStatus
	pods  []gateway.PodUsage
	nodes []gateway.NodeStatus
	err   error
}

func (f *fakeCapacity) AppsNamespace() string { return "cloud-apps" }
func (f *fakeCapacity) AppQuota(context.Context) (gateway.QuotaStatus, error) {
	return f.quota, f.err
}
func (f *fakeCapacity) AppPods(context.Context) ([]gateway.PodUsage, error) { return f.pods, nil }
func (f *fakeCapacity) Nodes(context.Context) ([]gateway.NodeStatus, error) { return f.nodes, nil }

func TestGetCapacity(t *testing.T) {
	const mib = int64(1) << 20
	capa := &fakeCapacity{
		quota: gateway.QuotaStatus{Found: true,
			Hard: gateway.Resources{MemoryBytes: 2560 * mib, CPUMillis: 4000, Pods: 30, StorageBytes: 50 << 30},
			Used: gateway.Resources{MemoryBytes: 512 * mib, CPUMillis: 500, Pods: 2}},
		pods: []gateway.PodUsage{{Name: "web-b", MemoryUsed: 200 * mib, MemoryLimit: 256 * mib, CPUUsed: 10},
			{Name: "web-a", MemoryUsed: 56 * mib, MemoryLimit: 256 * mib, CPUUsed: 5}},
		// 同じ VM の 2 ノード（12 GiB を分け合う）で、実際に 7 GiB 使っている
		nodes: []gateway.NodeStatus{{MemoryCapacity: 12 << 30, CPUCapacity: 10000, MemoryUsed: 3 << 30, CPUUsed: 100},
			{MemoryCapacity: 12 << 30, CPUCapacity: 10000, MemoryUsed: 4 << 30, CPUUsed: 200}},
	}
	d := Deps{Environment: "prod", Cluster: fakeCluster{}, Capacity: capa, MemoryReserve: 2 << 30}
	out, err := NewConsoleUsecase(d).GetCapacity(context.Background(), GetCapacityInput{})
	if err != nil {
		t.Fatal(err)
	}
	if out.Quota.Namespace != "cloud-apps" || out.Quota.Memory.Limit != 2560*mib || out.Quota.Cpu.Used != 500 || out.Quota.VolumeStorage.Limit != 50<<30 {
		t.Fatalf("quota %+v", out.Quota)
	}
	if m := out.Machine; m.MemoryTotal != 12<<30 || m.MemoryUsed != 7<<30 || m.MemoryReserved != 2<<30 || m.CpuTotalMillis != 10000 || m.CpuUsedMillis != 300 {
		t.Fatalf("machine %+v", m)
	}
	// 空き = 12 - 7 - 2 - (512MiB 予約 - 256MiB 使用中) = 2816MiB。枠の残り（2048MiB）の方が先に尽きる
	if f := out.Fits[1]; f.Name != "m" || f.Count != 8 || f.LimitedBy != service.LimitedByQuotaMemory {
		t.Fatalf("fit m %+v", f)
	}
	if out.Pods[0].Name != "web-a" || len(out.Pods) != 2 {
		t.Fatalf("pods %+v", out.Pods)
	}

	// Mac mini が詰まっているときは、枠が残っていても置けない
	capa.nodes[1].MemoryUsed = 7 << 30
	out, _ = NewConsoleUsecase(d).GetCapacity(context.Background(), GetCapacityInput{})
	if f := out.Fits[0]; f.Count != 0 || f.LimitedBy != service.LimitedByMachineMemory {
		t.Fatalf("machine full: %+v", f)
	}

	capa.err = errors.New("forbidden")
	if _, err := NewConsoleUsecase(d).GetCapacity(context.Background(), GetCapacityInput{}); err == nil {
		t.Fatal("expected error")
	}
}
