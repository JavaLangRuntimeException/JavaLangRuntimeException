// Package gateway は taramanji cloud のコンソールが使う外部（Kubernetes API・Datadog）の抽象。
package gateway

import (
	"context"
	"errors"
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
	// AppWorkloads はアプリ用 namespace の Deployment（アプリが実際に動いているか）
	AppWorkloads(ctx context.Context) ([]Workload, error)
	Nodes(ctx context.Context) ([]NodeStatus, error)
}

// リソースの種類（リポジトリのディレクトリ名: <環境>/<種類>/<名前>.yaml）
const (
	KindFunctions = "functions"
	KindAPIs      = "apis"
)

// ResourceFile はアプリ用のリポジトリにある、リソース（関数・API）1 つの YAML
type ResourceFile struct {
	Name string
	YAML string
	// Revision はファイルの版（git の blob の SHA）。更新・削除のとき、読んだあとに誰かが変えていないかを確かめる
	Revision string
}

var (
	// ErrResourceNotFound は YAML がない
	ErrResourceNotFound = errors.New("app not found")
	// ErrResourceConflict は読んだあとに誰か（別の画面・git push）が変えた
	ErrResourceConflict = errors.New("app was changed by someone else")
)

// ResourceStore はリソース（関数・API）の YAML の置き場（アプリ専用の git リポジトリ。Argo CD がそこからクラスターに入れる）。
// コンソールはクラスターに直接は書かない
type ResourceStore interface {
	List(ctx context.Context, kind string) ([]ResourceFile, error)
	Get(ctx context.Context, kind, name string) (ResourceFile, error)
	// Put は revision が空なら新しく作り、あればその版からの更新。新しい版を返す
	Put(ctx context.Context, kind, name, yaml, revision, message string) (string, error)
	Delete(ctx context.Context, kind, name, revision, message string) error
	// URL は YAML を人が見るページ（GitHub）
	URL(kind, name string) string
}

// Monitor は Datadog のモニター 1 つ（ID は Datadog が振る。作るときは 0）
type Monitor struct {
	ID      int64
	Name    string
	Query   string
	Message string
	Tags    []string
}

// Monitors は Datadog のモニターの読み書き（本番だけ。アプリケーションキーに monitors_read・monitors_write が要る）
type Monitors interface {
	// List は tags を全部持つモニター
	List(ctx context.Context, tags []string) ([]Monitor, error)
	Create(ctx context.Context, m Monitor) error
	Update(ctx context.Context, m Monitor) error
	Delete(ctx context.Context, id int64) error
}

// FunctionState は関数（アプリ用 namespace の Deployment）の今の台数
type FunctionState struct {
	Name     string
	Replicas int32
	Ready    int32
	// LastRequest は最後にリクエストを受けた時刻（どの API Gateway の Pod が受けたものでも）。まだなければゼロ値
	LastRequest time.Time
}

// ErrFunctionNotFound は関数（Deployment）がない
var ErrFunctionNotFound = errors.New("function not found")

// FunctionScaler は API Gateway が関数を起こす・寝かせるための Kubernetes API。
// 触れるのは台数（scale）と、最後のリクエストの時刻の注釈だけ
type FunctionScaler interface {
	Function(ctx context.Context, name string) (FunctionState, error)
	// Running は 1 台以上で動いている関数
	Running(ctx context.Context) ([]FunctionState, error)
	Scale(ctx context.Context, name string, replicas int32) error
	Touch(ctx context.Context, name string, at time.Time) error
}
