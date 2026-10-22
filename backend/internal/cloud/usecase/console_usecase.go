package usecase

import (
	"context"
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
	Environment       string
	StorageHostSuffix string
	HostingHostSuffix string
	Cluster           gateway.Cluster
	// Metrics は本番だけ。nil ならメトリクスは出さない（dev / stg は集めていない）
	Metrics      gateway.Metrics
	MetricsScope service.MetricsScope
	Clock        func() time.Time
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
		Components: []*Component{}, StorageHostSuffix: u.d.StorageHostSuffix, HostingHostSuffix: u.d.HostingHostSuffix}
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
