// Package controller は taramanji cloud のコントローラー（cloud-ctl）。
// 環境の共有の namespace の ConfigMap（関数の登録・データベース・バケットの定義。Argo CD がリポジトリから入れる）を見て、
//   - 関数ごとの namespace と、その囲い（ResourceQuota・LimitRange・NetworkPolicy・Pod Security・権限）を作る
//   - 共有の PostgreSQL / Redis から、データベースとユーザーを切り出す
//   - 接続先（URL・パスワード・トークン）の Secret を、それをつないだ関数の namespace にだけ作る
//
// 関数の namespace と囲いは、アプリ用のリポジトリからは作れない（リポジトリのトークンが漏れても、囲いのない namespace は作れない）。
// パスワードとトークンはマスターキーから導くので、どこにも保存しない。
// 定義が消えたら、namespace（関数）・Secret を消し、データベースはログインを止める（中身は消さない）
package controller

import (
	"context"
	"fmt"
	"log/slog"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/service"
	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/storage"
)

// コントローラーが作ったものに付けるラベル（自分が作ったものだけを消す）
const (
	labelManaged  = "cloud.taramanji.com/managed-by"
	managedValue  = "cloud-ctl"
	labelRegistry = "cloud.taramanji.com/registry"
	labelTier     = "cloud.taramanji.com/tier"
	labelEnv      = "cloud.taramanji.com/env"
	tierFunction  = "function"
)

// Endpoint は関数から見た接続先（Service の DNS 名とポート）
type Endpoint struct {
	Host string
	Port int
}

type Config struct {
	Cluster   gateway.ResourceCluster
	MasterKey []byte
	// Env は環境（prod / stg / dev）。関数の namespace の名前に使う
	Env string
	// Registry は環境の共有の namespace（cloud-apps など）。関数の namespace に、どの環境のものかの印として付ける
	Registry string
	// ConsoleNamespace はコンソール・API Gateway・ストレージ・データベースがいる namespace（cloud など）
	ConsoleNamespace string
	// Engines はエンジン名（postgres / redis）→ 切り出し方と接続先。ないエンジンのデータベースは「使えない」と状態に書く
	Engines   map[string]gateway.DatabaseEngine
	Endpoints map[string]Endpoint
	// StorageURL は関数から見たオブジェクトストレージ（http://cloud-storage.<namespace>.svc.cluster.local:8080）
	StorageURL string
	Log        *slog.Logger
}

type Controller struct{ c Config }

func New(c Config) *Controller {
	if c.Log == nil {
		c.Log = slog.Default()
	}
	return &Controller{c: c}
}

// Run は ctx が終わるまで、定義と実際をそろえ続ける
func (c *Controller) Run(ctx context.Context, every time.Duration) {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		if err := c.Reconcile(ctx); err != nil {
			c.c.Log.Warn("reconcile failed", "error", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

func secretLabels(kind, name, engine string) map[string]string {
	l := map[string]string{labelManaged: managedValue, service.LabelKind: kind}
	if kind == service.KindDatabase {
		l[service.LabelDatabase], l[service.LabelEngine] = name, engine
	} else {
		l[service.LabelBucket] = name
	}
	return l
}

// DatabaseSecret はデータベースの接続先の Secret の中身
func DatabaseSecret(engine, name, password string, ep Endpoint) map[string]string {
	port := strconv.Itoa(ep.Port)
	hostPort := ep.Host + ":" + port
	if engine == service.EngineRedis {
		// Redis はユーザーごとに、接頭辞（<名前>:）で始まるキーだけを触れる
		return map[string]string{"HOST": ep.Host, "PORT": port, "USER": name, "PASSWORD": password, "PREFIX": service.RedisPrefix(name),
			"URL": (&url.URL{Scheme: "redis", User: url.UserPassword(name, password), Host: hostPort}).String()}
	}
	ident := service.PostgresIdent(name)
	return map[string]string{"HOST": ep.Host, "PORT": port, "USER": ident, "PASSWORD": password, "NAME": ident,
		"URL": (&url.URL{Scheme: "postgres", User: url.UserPassword(ident, password), Host: hostPort, Path: "/" + ident, RawQuery: "sslmode=disable"}).String()}
}

// connection は関数に渡す接続先の Secret（ラベルと中身）
type connection struct {
	labels map[string]string
	data   map[string]string
}

// Reconcile は 1 回そろえる。1 つのリソースの失敗で、ほかを止めない
func (c *Controller) Reconcile(ctx context.Context) error {
	dbs, err := c.c.Cluster.ConfigMaps(ctx, service.LabelDatabase)
	if err != nil {
		return err
	}
	buckets, err := c.c.Cluster.ConfigMaps(ctx, service.LabelBucket)
	if err != nil {
		return err
	}
	fns, err := c.c.Cluster.ConfigMaps(ctx, service.LabelFunction)
	if err != nil {
		return err
	}

	// 1. データベースとバケット。共有の namespace に接続先の Secret の元を置く（定義が消えたかを知る印にもなる）
	ready := map[string]connection{}
	want := map[string]bool{}
	for _, cm := range dbs {
		name, engine := cm.Labels[service.LabelDatabase], cm.Labels[service.LabelEngine]
		if !service.ValidName(name) || cm.Name != service.DatabaseObjectName(name) {
			continue
		}
		want[cm.Name] = true
		status := service.StatusReady
		conn, err := c.ensureDatabase(ctx, name, engine)
		if err != nil {
			c.c.Log.Warn("database failed", "database", name, "engine", engine, "error", err)
			status = err.Error()
		} else {
			ready[cm.Name] = conn
		}
		c.setStatus(ctx, cm, status)
	}
	for _, cm := range buckets {
		name := cm.Labels[service.LabelBucket]
		if !service.ValidName(name) || cm.Name != service.BucketObjectName(name) {
			continue
		}
		want[cm.Name] = true
		conn := connection{labels: secretLabels(service.KindBucket, name, ""),
			data: map[string]string{"URL": c.c.StorageURL + "/b/" + name, "TOKEN": storage.Token(c.c.MasterKey, name)}}
		if err := c.c.Cluster.PutSecret(ctx, "", service.BucketSecretName(name), conn.labels, conn.data); err != nil {
			c.c.Log.Warn("bucket secret failed", "bucket", name, "error", err)
			continue
		}
		ready[cm.Name] = conn
	}

	// 2. 関数ごとの namespace
	wantNS := map[string]bool{}
	for _, cm := range fns {
		name := cm.Labels[service.LabelFunction]
		if !service.ValidName(name) || cm.Name != service.FunctionRegistrationName(name) {
			continue
		}
		reg, ok := service.ParseRegistration(name, cm.Data)
		if !ok {
			c.setStatus(ctx, cm, "登録の data（CPU・メモリ・つなぐもの）を読めません")
			continue
		}
		ns := service.FunctionNamespace(c.c.Env, name)
		wantNS[ns] = true
		status := service.StatusReady
		if err := c.ensureFunction(ctx, reg, ns, ready); err != nil {
			c.c.Log.Warn("function namespace failed", "function", name, "error", err)
			status = err.Error()
		}
		c.setStatus(ctx, cm, status)
	}

	// 3. 定義が消えた関数: namespace ごと消す（自分が作った、この環境のものだけ）
	nss, err := c.c.Cluster.Namespaces(ctx, labelManaged+"="+managedValue+","+labelRegistry+"="+c.c.Registry)
	if err != nil {
		return err
	}
	for _, n := range nss {
		fn := n.Labels[service.LabelFunction]
		if wantNS[n.Name] || !service.ValidName(fn) || n.Name != service.FunctionNamespace(c.c.Env, fn) {
			continue
		}
		c.c.Log.Info("delete function namespace", "namespace", n.Name)
		if err := c.c.Cluster.DeleteNamespace(ctx, n.Name); err != nil {
			c.c.Log.Warn("delete namespace failed", "namespace", n.Name, "error", err)
		}
	}

	// 4. 定義が消えたデータベース・バケット: 共有の namespace の Secret を消し、データベースはログインを止める
	secrets, err := c.c.Cluster.Secrets(ctx, "", labelManaged+"="+managedValue)
	if err != nil {
		return err
	}
	for _, s := range secrets {
		if want[s.Name] {
			continue
		}
		if s.Labels[service.LabelKind] == service.KindDatabase {
			if eng, ok := c.c.Engines[s.Labels[service.LabelEngine]]; ok {
				if err := eng.Disable(ctx, s.Labels[service.LabelDatabase]); err != nil {
					// 止められなかったら Secret を残し、次の回にやり直す
					c.c.Log.Warn("disable failed", "database", s.Labels[service.LabelDatabase], "error", err)
					continue
				}
			}
		}
		if err := c.c.Cluster.DeleteSecret(ctx, "", s.Name); err != nil {
			c.c.Log.Warn("delete secret failed", "secret", s.Name, "error", err)
		}
	}
	return nil
}

// setStatus は状態を ConfigMap の注釈に書く。変わったときだけ書く（毎回書くと、ConfigMap の版が増え続ける）
func (c *Controller) setStatus(ctx context.Context, cm gateway.LabeledObject, status string) {
	if cm.Annotations[service.AnnotationStatus] == status {
		return
	}
	if err := c.c.Cluster.AnnotateConfigMap(ctx, cm.Name, service.AnnotationStatus, status); err != nil {
		c.c.Log.Warn("status failed", "configmap", cm.Name, "error", err)
	}
}

func (c *Controller) ensureDatabase(ctx context.Context, name, engine string) (connection, error) {
	eng, ok := c.c.Engines[engine]
	if !ok {
		return connection{}, fmt.Errorf("この環境では %s を使えません", engine)
	}
	password := service.DatabasePassword(c.c.MasterKey, engine, name)
	if err := eng.Ensure(ctx, name, password); err != nil {
		return connection{}, fmt.Errorf("%s に作れませんでした: %w", engine, err)
	}
	conn := connection{labels: secretLabels(service.KindDatabase, name, engine), data: DatabaseSecret(engine, name, password, c.c.Endpoints[engine])}
	if err := c.c.Cluster.PutSecret(ctx, "", service.DatabaseObjectName(name), conn.labels, conn.data); err != nil {
		return connection{}, fmt.Errorf("接続先の Secret を作れませんでした: %w", err)
	}
	return conn, nil
}

// ensureFunction は関数の namespace と囲いを作り、つないだものの接続先の Secret を置く
func (c *Controller) ensureFunction(ctx context.Context, reg service.Registration, ns string, ready map[string]connection) error {
	labels := map[string]string{labelManaged: managedValue, service.LabelFunction: reg.Name}
	nsLabels := map[string]string{
		labelManaged: managedValue, labelRegistry: c.c.Registry, labelTier: tierFunction, labelEnv: c.c.Env, service.LabelFunction: reg.Name,
		// 特権コンテナ・hostPath などは使えない
		"pod-security.kubernetes.io/enforce": "baseline",
		"pod-security.kubernetes.io/warn":    "restricted",
	}
	if err := c.c.Cluster.PutNamespace(ctx, ns, nsLabels); err != nil {
		return fmt.Errorf("namespace を作れませんでした: %w", err)
	}
	for _, o := range FunctionGuardrails(reg, c.c.ConsoleNamespace) {
		if err := c.c.Cluster.Put(ctx, ns, o.Resource, o.Name, labels, o.Body); err != nil {
			return fmt.Errorf("%s %s を作れませんでした: %w", o.Resource, o.Name, err)
		}
	}

	// つないだデータベース・バケットの接続先を、この namespace にだけ置く
	wantSecrets := map[string]bool{}
	var missing []string
	for _, d := range reg.Databases {
		wantSecrets[service.DatabaseObjectName(d)] = true
		if !c.copySecret(ctx, ns, service.DatabaseObjectName(d), ready) {
			missing = append(missing, "データベース "+d)
		}
	}
	for _, b := range reg.Buckets {
		wantSecrets[service.BucketSecretName(b)] = true
		if !c.copySecret(ctx, ns, service.BucketSecretName(b), ready) {
			missing = append(missing, "バケット "+b)
		}
	}
	secrets, err := c.c.Cluster.Secrets(ctx, ns, labelManaged+"="+managedValue)
	if err != nil {
		return err
	}
	for _, s := range secrets {
		if !wantSecrets[s.Name] {
			if err := c.c.Cluster.DeleteSecret(ctx, ns, s.Name); err != nil {
				return err
			}
		}
	}
	if len(missing) > 0 {
		return fmt.Errorf("つなぐ %s がまだ使えません（使えるようになると、関数が起動できるようになります）", strings.Join(missing, "・"))
	}
	return nil
}

func (c *Controller) copySecret(ctx context.Context, ns, name string, ready map[string]connection) bool {
	conn, ok := ready[name]
	if !ok {
		return false
	}
	if err := c.c.Cluster.PutSecret(ctx, ns, name, conn.labels, conn.data); err != nil {
		c.c.Log.Warn("copy secret failed", "namespace", ns, "secret", name, "error", err)
		return false
	}
	return true
}

// Guardrail は関数の namespace に置く囲いのオブジェクト 1 つ
type Guardrail struct {
	Resource string
	Name     string
	Body     map[string]any
}

// FunctionGuardrails は関数の namespace の囲い:
//   - 量: 登録した CPU・メモリの 2 台分まで（入れ替えのあいだだけ 2 台になる）。コンテナ 1 つは登録した量まで
//   - 順番: 優先度 cloud-workload のない Pod は作れない（メモリが足りなくなったら taramanji より先に止める）
//   - 通信: 受けるのは API Gateway（cloud-gw）からだけ。出られるのは DNS・データベースとストレージ・インターネットだけ
//   - 権限: Pod に Kubernetes のトークンを渡さない。API Gateway は台数だけ、コンソールの API は読むだけ
func FunctionGuardrails(reg service.Registration, consoleNS string) []Guardrail {
	mem := strconv.FormatInt(reg.MemoryBytes>>20, 10) + "Mi"
	mem2 := strconv.FormatInt(2*(reg.MemoryBytes>>20), 10) + "Mi"
	cpu := strconv.FormatInt(reg.CPUMillis, 10) + "m"
	cpu2 := strconv.FormatInt(2*reg.CPUMillis, 10) + "m"
	private := []string{"10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "100.64.0.0/10", "169.254.0.0/16"}
	console := map[string]any{"matchLabels": map[string]string{"kubernetes.io/metadata.name": consoleNS}}
	return []Guardrail{
		{"resourcequotas", "function", map[string]any{"spec": map[string]any{"hard": map[string]string{
			"requests.memory": mem2, "limits.memory": mem2, "requests.cpu": cpu2, "limits.cpu": cpu2, "pods": "2",
			"persistentvolumeclaims": "1", "requests.storage": "5Gi", "services.nodeports": "0", "services.loadbalancers": "0",
		}}}},
		{"resourcequotas", "require-cloud-priority", map[string]any{"spec": map[string]any{
			"hard":          map[string]string{"pods": "0"},
			"scopeSelector": map[string]any{"matchExpressions": []any{map[string]any{"scopeName": "PriorityClass", "operator": "NotIn", "values": []string{service.PriorityClass}}}},
		}}},
		{"limitranges", "function", map[string]any{"spec": map[string]any{"limits": []any{
			map[string]any{"type": "Container", "default": map[string]string{"memory": mem, "cpu": cpu}, "defaultRequest": map[string]string{"memory": mem, "cpu": cpu},
				"max": map[string]string{"memory": mem, "cpu": cpu}, "maxLimitRequestRatio": map[string]string{"memory": "1"}},
			map[string]any{"type": "PersistentVolumeClaim", "max": map[string]string{"storage": "5Gi"}},
		}}}},
		{"networkpolicies", "default-deny", map[string]any{"spec": map[string]any{"podSelector": map[string]any{}, "policyTypes": []string{"Ingress", "Egress"}}}},
		{"networkpolicies", "function", map[string]any{"spec": map[string]any{
			"podSelector": map[string]any{}, "policyTypes": []string{"Ingress", "Egress"},
			"ingress": []any{map[string]any{"from": []any{map[string]any{
				"namespaceSelector": console, "podSelector": map[string]any{"matchLabels": map[string]string{"app.kubernetes.io/name": "cloud-gw"}},
			}}}},
			"egress": []any{
				map[string]any{"to": []any{map[string]any{
					"namespaceSelector": map[string]any{"matchLabels": map[string]string{"kubernetes.io/metadata.name": "kube-system"}},
					"podSelector":       map[string]any{"matchLabels": map[string]string{"k8s-app": "kube-dns"}},
				}}, "ports": []any{map[string]any{"port": 53, "protocol": "UDP"}, map[string]any{"port": 53, "protocol": "TCP"}}},
				map[string]any{"to": []any{map[string]any{
					"namespaceSelector": console,
					"podSelector": map[string]any{"matchExpressions": []any{map[string]any{"key": "app.kubernetes.io/name", "operator": "In",
						"values": []string{"cloud-postgres", "cloud-redis", "cloud-storage"}}}},
				}}, "ports": []any{map[string]any{"port": 5432}, map[string]any{"port": 6379}, map[string]any{"port": 8080}}},
				map[string]any{"to": []any{map[string]any{"ipBlock": map[string]any{"cidr": "0.0.0.0/0", "except": private}}}},
			},
		}}},
		{"serviceaccounts", "default", map[string]any{"automountServiceAccountToken": false}},
		{"rolebindings", "cloud-gw", map[string]any{
			"roleRef":  map[string]string{"apiGroup": "rbac.authorization.k8s.io", "kind": "ClusterRole", "name": "cloud-function-scaler"},
			"subjects": []any{map[string]string{"kind": "ServiceAccount", "name": "cloud-gw", "namespace": consoleNS}},
		}},
		{"rolebindings", "cloud-api", map[string]any{
			"roleRef":  map[string]string{"apiGroup": "rbac.authorization.k8s.io", "kind": "ClusterRole", "name": "cloud-function-reader"},
			"subjects": []any{map[string]string{"kind": "ServiceAccount", "name": "cloud-api", "namespace": consoleNS}},
		}},
	}
}
