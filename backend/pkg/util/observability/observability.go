// Package observability は Datadog（APM・Go ランタイムメトリクス・DogStatsD の業務メトリクス）を初期化する。
// DD_AGENT_HOST が無い環境（ローカル・テスト）では何もしない。ログは pkg/util/logger が担当する。
package observability

import (
	"time"

	"github.com/DataDog/datadog-go/v5/statsd"
	"github.com/DataDog/dd-trace-go/v2/ddtrace/tracer"

	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/env"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/logger"
)

// Metrics は業務メトリクスの送信口
type Metrics interface {
	Count(name string, value int64, tags ...string)
	Gauge(name string, value float64, tags ...string)
	Timing(name string, d time.Duration, tags ...string)
}

type statsdMetrics struct{ c *statsd.Client }

func (m statsdMetrics) Count(name string, v int64, tags ...string)   { _ = m.c.Count(name, v, tags, 1) }
func (m statsdMetrics) Gauge(name string, v float64, tags ...string) { _ = m.c.Gauge(name, v, tags, 1) }
func (m statsdMetrics) Timing(name string, d time.Duration, tags ...string) {
	_ = m.c.Distribution(name, float64(d.Milliseconds()), tags, 1)
}

// Noop はメトリクスを捨てる（テスト・ローカル用）
type Noop struct{}

func (Noop) Count(string, int64, ...string)          {}
func (Noop) Gauge(string, float64, ...string)        {}
func (Noop) Timing(string, time.Duration, ...string) {}

// Init はサービス起動時に 1 回呼ぶ。戻り値の関数は終了時に呼ぶ（送信待ちを流す）。
// env / version は DD_ENV / DD_VERSION（k8s のラベル由来）を tracer が読む。
func Init(service string) (Metrics, func()) {
	host := env.DatadogAgentHost()
	if host == "" {
		return Noop{}, func() {}
	}
	if err := tracer.Start(tracer.WithService(service), tracer.WithRuntimeMetrics(), tracer.WithLogStartup(false)); err != nil {
		logger.L().Warn("tracer start failed", "error", err)
	}
	c, err := statsd.New(host+":8125", statsd.WithTags([]string{"service:" + service}))
	if err != nil {
		logger.L().Warn("statsd init failed", "error", err)
		return Noop{}, tracer.Stop
	}
	return statsdMetrics{c}, func() { _ = c.Flush(); _ = c.Close(); tracer.Stop() }
}
