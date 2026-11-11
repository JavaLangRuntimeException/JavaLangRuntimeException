package usecase

import (
	"context"
	"math"
	"sort"
	"sync"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/service"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/cfaccess"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/errs"
)

type Deps struct {
	// Environment は prod / stg / dev
	Environment string
	Cluster     gateway.Cluster
	// Metrics は本番だけ。nil ならメトリクスは出さない（dev / stg は集めていない）
	Metrics      gateway.Metrics
	MetricsScope service.MetricsScope
	// Capacity はアプリ用 namespace の枠とノードの使用量（全環境で使う）
	Capacity gateway.Capacity
	// MemoryReserve は taramanji.com・gws の伸びしろとして、アプリに渡さずに残すメモリ（バイト）
	MemoryReserve int64
	// Apps はリソース（関数・API）の YAML の置き場（アプリ専用の git リポジトリ）。nil なら関数と API は使えない
	Apps gateway.ResourceStore
	// APITarget は公開ホスト名の接尾辞と、API Gateway のいる namespace
	APITarget service.APITarget
	// Objects はオブジェクトストレージ。nil ならバケットは使えない
	Objects gateway.ObjectStore
	// DNS は公開ホスト名の DNS の自動登録。nil なら手で登録する
	DNS gateway.DNS
	// Access は CDN の独自ドメインを Cloudflare Access で守る。nil なら独自ドメインは足せない（DNS も要る）
	Access gateway.AccessHosts
	// Purger は Cloudflare のエッジのキャッシュを消す。nil なら消さない（期限が切れるまで残る）
	Purger gateway.CachePurger
	// State はデータベースの状態（コントローラーが書く）を読む。nil なら状態は出さない
	State gateway.ResourceState
	// DatabasesEnabled は共有の PostgreSQL / Redis とコントローラーが動いているか（画面に出すだけ）
	DatabasesEnabled bool
	// IdleTimeout は関数を 0 台に戻すまでの時間（画面に出すだけ。実際に戻すのは API Gateway）
	IdleTimeout time.Duration
	// AppsRepository は画面に出すリポジトリ名（owner/name）
	AppsRepository string
	// Monitors は Datadog のモニター（本番だけ）。nil なら監視は YAML に残すだけ
	Monitors   gateway.Monitors
	AlertScope service.AlertScope
	Clock      func() time.Time
}

type ConsoleUsecaseImpl struct{ d Deps }

var _ ConsoleUsecase = (*ConsoleUsecaseImpl)(nil)

func NewConsoleUsecase(d Deps) *ConsoleUsecaseImpl {
	if d.Clock == nil {
		d.Clock = time.Now
	}
	return &ConsoleUsecaseImpl{d: d}
}

func (u *ConsoleUsecaseImpl) GetOverview(ctx context.Context, _ GetOverviewInput) (*GetOverviewOutput, error) {
	ws, err := u.d.Cluster.Workloads(ctx)
	if err != nil {
		return nil, errs.NewInternalError(err)
	}
	out := &GetOverviewOutput{Environment: u.d.Environment, Email: cfaccess.EmailFrom(ctx), MetricsEnabled: u.d.Metrics != nil,
		Components: []*Component{}, StorageHostSuffix: u.d.APITarget.Suffix(service.HostStorage), HostingHostSuffix: u.d.APITarget.Suffix(service.HostAPI),
		CdnHostSuffix: u.d.APITarget.Suffix(service.HostCDN)}
	for _, w := range ws {
		out.Components = append(out.Components, &Component{Name: w.Name, Ready: w.Ready, Desired: w.Desired, Version: service.Version(w.Image)})
	}
	sort.Slice(out.Components, func(i, j int) bool { return out.Components[i].Name < out.Components[j].Name })
	return out, nil
}

func (u *ConsoleUsecaseImpl) GetMetrics(ctx context.Context, in GetMetricsInput) (*GetMetricsOutput, error) {
	if u.d.Metrics == nil {
		return nil, errs.New(errs.ErrorTypeBadRequest, "この環境ではメトリクスを集めていません").WithCode("metrics_disabled")
	}
	span, ok := service.Ranges[in.Range]
	if !ok {
		return nil, errs.NewValidationError("range", "期間は 1h・1d・7d のどれかです").WithCode("invalid_range")
	}
	to := u.d.Clock()
	from := to.Add(-span)
	queries := service.Queries(u.d.MetricsScope)
	results := make([][]*Series, len(queries))
	errList := make([]error, len(queries))
	var wg sync.WaitGroup
	for i, q := range queries {
		wg.Add(1)
		go func() {
			defer wg.Done()
			series, err := u.d.Metrics.Query(ctx, q.Query, from, to)
			if err != nil {
				errList[i] = err
				return
			}
			for _, s := range series {
				vals := make([]float64, len(s.Values))
				for j, v := range s.Values {
					vals[j] = v * q.Scale
				}
				results[i] = append(results[i], &Series{Metric: q.ID, Group: service.GroupLabel(q.GroupTag, s.Tags), Unit: q.Unit,
					TimestampsMs: s.TimestampsMs, Values: vals})
			}
		}()
	}
	wg.Wait()
	out := &GetMetricsOutput{Series: []*Series{}}
	for i := range queries {
		if errList[i] != nil {
			return nil, errs.New(errs.ErrorTypeUpstream, "Datadog からメトリクスを読めませんでした").WithCode("metrics_upstream").
				WithDetail(errList[i].Error()).WithCause(errList[i])
		}
		out.Series = append(out.Series, results[i]...)
	}
	return out, nil
}

func (u *ConsoleUsecaseImpl) GetCapacity(ctx context.Context, _ GetCapacityInput) (*GetCapacityOutput, error) {
	q, err := u.d.Capacity.AppQuota(ctx)
	if err != nil {
		return nil, errs.NewInternalError(err)
	}
	pods, err := u.d.Capacity.AppPods(ctx)
	if err != nil {
		return nil, errs.NewInternalError(err)
	}
	nodes, err := u.d.Capacity.Nodes(ctx)
	if err != nil {
		return nil, errs.NewInternalError(err)
	}
	m := service.MachineOf(nodes)
	free := service.MachineFree(m, u.d.MemoryReserve, q, pods)

	out := &GetCapacityOutput{
		Quota: &Quota{Namespace: u.d.Capacity.AppsNamespace(),
			Memory:        &Amount{Used: q.Used.MemoryBytes, Limit: q.Hard.MemoryBytes},
			Cpu:           &Amount{Used: q.Used.CPUMillis, Limit: q.Hard.CPUMillis},
			Pods:          &Amount{Used: q.Used.Pods, Limit: q.Hard.Pods},
			VolumeStorage: &Amount{Used: q.Used.StorageBytes, Limit: q.Hard.StorageBytes}},
		Machine: &Machine{MemoryTotal: m.MemoryTotal, MemoryUsed: m.MemoryUsed, MemoryReserved: u.d.MemoryReserve,
			CpuTotalMillis: m.CPUTotal, CpuUsedMillis: m.CPUUsed},
		Fits: []*SizeFit{},
		Pods: []*PodUsage{},
	}
	for _, f := range service.Fits(q, free) {
		out.Fits = append(out.Fits, &SizeFit{Name: f.Type.Name, Memory: f.Type.MemoryBytes, CpuMillis: f.Type.CPUMillis,
			Count: int32(min(f.Count, math.MaxInt32)), LimitedBy: f.LimitedBy})
	}
	for _, p := range pods {
		out.Pods = append(out.Pods, &PodUsage{Name: p.Name, MemoryUsed: p.MemoryUsed, MemoryLimit: p.MemoryLimit, CpuUsedMillis: p.CPUUsed})
	}
	sort.Slice(out.Pods, func(i, j int) bool { return out.Pods[i].Name < out.Pods[j].Name })
	return out, nil
}
