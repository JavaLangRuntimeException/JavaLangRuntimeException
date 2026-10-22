// Package gateway は taramanji cloud のコンソールが使う外部（Kubernetes API・Datadog）の抽象。
package gateway

import (
	"context"
	"time"
)

// Workload はコンソール自身を動かしている Deployment / StatefulSet
type Workload struct {
	Name    string
	Ready   int32
	Desired int32
	Image   string
}

// Cluster は自分の namespace の Kubernetes API（読み取りだけ）
type Cluster interface {
	Workloads(ctx context.Context) ([]Workload, error)
}

// Series は Datadog の時系列 1 本
type Series struct {
	// Tags は "by {...}" で分けたときのタグ（例: ["kube_deployment:console"]）
	Tags         []string
	TimestampsMs []int64
	Values       []float64
}

// Metrics は Datadog のメトリクスの問い合わせ
type Metrics interface {
	Query(ctx context.Context, query string, from, to time.Time) ([]Series, error)
}
