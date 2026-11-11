// Package gateway は taramanji cloud のコンソールが使う外部（Kubernetes API・Datadog）の抽象。
package gateway

import (
	"context"
	"errors"
	"net/http"
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
	KindBuckets   = "buckets"
	KindCDN       = "cdn"
	KindDatabases = "databases"
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
	// MemoryBytes は 1 台あたりのメモリの上限（環境の合計の枠を確かめるのに使う）
	MemoryBytes int64
}

// ErrFunctionNotFound は関数（Deployment）がない
var ErrFunctionNotFound = errors.New("function not found")

// FunctionScaler は API Gateway が関数を起こす・寝かせるための Kubernetes API（関数ごとの namespace の Deployment）。
// 触れるのは台数（scale）と、最後のリクエストの時刻の注釈だけ
type FunctionScaler interface {
	Function(ctx context.Context, name string) (FunctionState, error)
	// Running は 1 台以上で動いている関数
	Running(ctx context.Context) ([]FunctionState, error)
	Scale(ctx context.Context, name string, replicas int32) error
	Touch(ctx context.Context, name string, at time.Time) error
}

// BucketUsage はストレージにあるバケットと、その使用量
type BucketUsage struct {
	Name    string
	Objects int64
	Bytes   int64
}

// StoredObject はオブジェクトの一覧の 1 件
type StoredObject struct {
	Key      string
	Size     int64
	Modified time.Time
}

// ErrObjectNotFound はバケットかオブジェクトがない
var ErrObjectNotFound = errors.New("object not found")

// ObjectStore はオブジェクトストレージ（cloud-storage）の読み書き。管理用のトークンで全バケットを扱う
type ObjectStore interface {
	Buckets(ctx context.Context) ([]BucketUsage, error)
	List(ctx context.Context, bucket, prefix string) (objects []StoredObject, truncated bool, err error)
	Delete(ctx context.Context, bucket, key string) error
	// Proxy は PUT / GET / HEAD をそのままストレージに渡す（アップロード・ダウンロード）
	Proxy(w http.ResponseWriter, r *http.Request, bucket, key string)
}

// DNS は公開ホスト名の DNS（Cloudflare）。自分が作ったレコードだけを消す
type DNS interface {
	// Ensure はホスト名をトンネルに向ける。既に別の向き先のレコードがあればエラー
	Ensure(ctx context.Context, host string) error
	Remove(ctx context.Context, host string) error
}

// AccessHosts は CDN の独自ドメインを Cloudflare Access で守る（ログインあり）。
// SetHosts は守るホスト名の一覧を、渡したものにそろえる（空なら守るアプリを消す）
type AccessHosts interface {
	SetHosts(ctx context.Context, hosts []string) error
}

// LabeledObject は ConfigMap / Secret / Namespace の、名前・ラベル・注釈（ConfigMap は data も）
type LabeledObject struct {
	Name        string
	Labels      map[string]string
	Annotations map[string]string
	Data        map[string]string
}

// ResourceState はコンソールが、データベースの状態（コントローラーが ConfigMap の注釈に書く）を読む
type ResourceState interface {
	// ConfigMaps は環境の共有の namespace の、ラベル labelKey が付いた ConfigMap
	ConfigMaps(ctx context.Context, labelKey string) ([]LabeledObject, error)
}

// ResourceCluster はコントローラーが使う Kubernetes API:
// 定義（共有の namespace の ConfigMap）を読んで状態を書き、関数ごとの namespace と囲い・接続先の Secret を作る・消す。
// ns が空なら、環境の共有の namespace
type ResourceCluster interface {
	ResourceState
	AnnotateConfigMap(ctx context.Context, name, key, value string) error
	Namespaces(ctx context.Context, labelSelector string) ([]LabeledObject, error)
	PutNamespace(ctx context.Context, name string, labels map[string]string) error
	DeleteNamespace(ctx context.Context, name string) error
	// Put は囲いのオブジェクト（resourcequotas・limitranges・networkpolicies・serviceaccounts・rolebindings）を置く
	Put(ctx context.Context, ns, resource, name string, labels map[string]string, obj map[string]any) error
	Secrets(ctx context.Context, ns, labelSelector string) ([]LabeledObject, error)
	// PutSecret は Secret を置く。data のキーが DockerConfigKey だけなら、イメージを読むための Secret（kubernetes.io/dockerconfigjson）にする
	PutSecret(ctx context.Context, ns, name string, labels, data map[string]string) error
	DeleteSecret(ctx context.Context, ns, name string) error
}

// DockerConfigKey はイメージを読むための Secret のキー
const DockerConfigKey = ".dockerconfigjson"

// DatabaseEngine は共有の PostgreSQL / Redis から、データベース（とユーザー）を切り出す。何度呼んでも同じ結果になる
type DatabaseEngine interface {
	// Ensure は name のデータベースとユーザーを、このパスワードで使えるようにする
	Ensure(ctx context.Context, name, password string) error
	// Disable はログインを止める。中身は消さない（同じ名前で作り直すと、また使える）
	Disable(ctx context.Context, name string) error
}

// ResourceSource は、リソースの YAML の元（アプリ用のリポジトリ）を読むだけの口（デプロイヤーが使う）
type ResourceSource interface {
	// Head はブランチの今のコミット（変わっていなければ、入れ直さなくてよい）
	Head(ctx context.Context) (string, error)
	List(ctx context.Context, kind string) ([]ResourceFile, error)
}

// ManagedObject はデプロイヤーが入れた Kubernetes のオブジェクト（消すときに使う）
type ManagedObject struct {
	Kind      string
	Namespace string
	Name      string
	// Source は元の YAML（「種類.名前」。functions.blog など）
	Source string
}

// Applier はデプロイヤーが Kubernetes にオブジェクトを入れる・消す口。
// 扱う種類は Deployment・Service・ConfigMap・PersistentVolumeClaim・HTTPRoute だけ
type Applier interface {
	// Apply は server-side apply で入れる（obj は metadata.namespace 付きの 1 オブジェクト）
	Apply(ctx context.Context, obj map[string]any) error
	// Managed は、この環境でデプロイヤーが入れたオブジェクト（ラベルで探す）
	Managed(ctx context.Context, env string) ([]ManagedObject, error)
	Delete(ctx context.Context, o ManagedObject) error
	NamespaceExists(ctx context.Context, ns string) (bool, error)
	// PutConfigMap は共有の namespace の ConfigMap を丸ごと置き換える（デプロイの様子を書く）
	PutConfigMap(ctx context.Context, name string, labels, data map[string]string) error
}

// ResourceRepo は置き場（コンソールが書く）と元（デプロイヤーが読む）の両方
type ResourceRepo interface {
	ResourceStore
	ResourceSource
}
