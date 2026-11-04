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

// Resources は容量の量。メモリ・ストレージはバイト、CPU はミリコア
type Resources struct {
	MemoryBytes  int64
	CPUMillis    int64
	Pods         int64
	StorageBytes int64
}

// QuotaStatus はアプリ用 namespace の ResourceQuota（Found=false なら枠がない＝アプリは置けない）
type QuotaStatus struct {
	Found bool
	Hard  Resources
	Used  Resources
}

// NodeStatus はノード 1 台の容量と実際の使用量（metrics-server）
type NodeStatus struct {
	Name           string
	MemoryCapacity int64
	CPUCapacity    int64
	MemoryUsed     int64
	CPUUsed        int64
}

// PodUsage はアプリ用 namespace の Pod 1 つの実際の使用量と上限
type PodUsage struct {
	Name        string
	MemoryUsed  int64
	MemoryLimit int64
	CPUUsed     int64
}

// Capacity はアプリを置ける余地を調べるための Kubernetes API（読み取りだけ）
type Capacity interface {
	AppsNamespace() string
	AppQuota(ctx context.Context) (QuotaStatus, error)
	AppPods(ctx context.Context) ([]PodUsage, error)
	Nodes(ctx context.Context) ([]NodeStatus, error)
}
