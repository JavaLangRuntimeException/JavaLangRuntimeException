package controller

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/service"
)

// fakeCluster は共有の namespace（""）と、関数ごとの namespace をまねる
type fakeCluster struct {
	configMaps []gateway.LabeledObject
	namespaces map[string]map[string]string
	// objects は「namespace/リソース/名前」→ 中身
	objects   map[string]map[string]any
	secrets   map[string]gateway.LabeledObject
	data      map[string]map[string]string
	annotated int
	// shared は Sealed Secrets が共有の namespace に作った Secret（シークレット）
	shared []gateway.LabeledObject
	// deployments は「namespace/名前」→ Pod テンプレートの注釈（あるものだけ）。podPatches は書いた回数
	deployments map[string]map[string]string
	podPatches  int
}

func newCluster(cms ...gateway.LabeledObject) *fakeCluster {
	return &fakeCluster{configMaps: cms, namespaces: map[string]map[string]string{}, objects: map[string]map[string]any{},
		secrets: map[string]gateway.LabeledObject{}, data: map[string]map[string]string{}, deployments: map[string]map[string]string{}}
}

func (f *fakeCluster) SharedSecrets(_ context.Context, key string) ([]gateway.LabeledObject, error) {
	out := []gateway.LabeledObject{}
	for _, s := range f.shared {
		if _, ok := s.Labels[key]; ok {
			out = append(out, s)
		}
	}
	return out, nil
}

func (f *fakeCluster) SetPodAnnotation(_ context.Context, ns, name, key, value string) error {
	a, ok := f.deployments[ns+"/"+name]
	if !ok || a[key] == value {
		return nil
	}
	a[key] = value
	f.podPatches++
	return nil
}

func (f *fakeCluster) ConfigMaps(_ context.Context, key string) ([]gateway.LabeledObject, error) {
	out := []gateway.LabeledObject{}
	for _, cm := range f.configMaps {
		if _, ok := cm.Labels[key]; ok {
			out = append(out, cm)
		}
	}
	return out, nil
}

func (f *fakeCluster) AnnotateConfigMap(_ context.Context, name, key, value string) error {
	for i := range f.configMaps {
		if f.configMaps[i].Name == name {
			f.configMaps[i].Annotations = map[string]string{key: value}
			f.annotated++
		}
	}
	return nil
}

func (f *fakeCluster) Namespaces(_ context.Context, selector string) ([]gateway.LabeledObject, error) {
	out := []gateway.LabeledObject{}
	for name, labels := range f.namespaces {
		match := true
		for _, kv := range strings.Split(selector, ",") {
			k, v, _ := strings.Cut(kv, "=")
			if labels[k] != v {
				match = false
			}
		}
		if match {
			out = append(out, gateway.LabeledObject{Name: name, Labels: labels})
		}
	}
	return out, nil
}

func (f *fakeCluster) PutNamespace(_ context.Context, name string, labels map[string]string) error {
	f.namespaces[name] = labels
	return nil
}

func (f *fakeCluster) DeleteNamespace(_ context.Context, name string) error {
	delete(f.namespaces, name)
	for k := range f.secrets {
		if strings.HasPrefix(k, name+"/") {
			delete(f.secrets, k)
			delete(f.data, k)
		}
	}
	return nil
}

func (f *fakeCluster) Put(_ context.Context, ns, resource, name string, _ map[string]string, obj map[string]any) error {
	if _, ok := f.namespaces[ns]; !ok {
		return errors.New("namespace not found")
	}
	f.objects[ns+"/"+resource+"/"+name] = obj
	return nil
}

func (f *fakeCluster) Secrets(_ context.Context, ns, _ string) ([]gateway.LabeledObject, error) {
	out := []gateway.LabeledObject{}
	for k, s := range f.secrets {
		if strings.HasPrefix(k, ns+"/") {
			out = append(out, s)
		}
	}
	return out, nil
}

func (f *fakeCluster) PutSecret(_ context.Context, ns, name string, labels, data map[string]string) error {
	f.secrets[ns+"/"+name] = gateway.LabeledObject{Name: name, Labels: labels}
	f.data[ns+"/"+name] = data
	return nil
}

func (f *fakeCluster) DeleteSecret(_ context.Context, ns, name string) error {
	delete(f.secrets, ns+"/"+name)
	delete(f.data, ns+"/"+name)
	return nil
}

type fakeEngine struct {
	users    map[string]string
	disabled []string
	err      error
}

func (f *fakeEngine) Ensure(_ context.Context, name, password string) error {
	if f.err != nil {
		return f.err
	}
	f.users[name] = password
	return nil
}

func (f *fakeEngine) Disable(_ context.Context, name string) error {
	f.disabled = append(f.disabled, name)
	return nil
}

func cm(name string, labels map[string]string, data ...map[string]string) gateway.LabeledObject {
	o := gateway.LabeledObject{Name: name, Labels: labels}
	if len(data) > 0 {
		o.Data = data[0]
	}
	return o
}

func registration(name, dbs, buckets string) gateway.LabeledObject {
	return cm("function-"+name, map[string]string{service.LabelFunction: name},
		map[string]string{"cpuMillis": "250", "memoryMiB": "256", "databases": dbs, "buckets": buckets})
}

var key = []byte("0123456789abcdef0123456789abcdef")

func newController(cluster *fakeCluster, pg, rd *fakeEngine) *Controller {
	return New(Config{Cluster: cluster, MasterKey: key, Env: "prod", Registry: "taramanji-cloud-apps", ConsoleNamespace: "taramanji-cloud",
		Engines:    map[string]gateway.DatabaseEngine{"postgres": pg, "redis": rd},
		Endpoints:  map[string]Endpoint{"postgres": {Host: "cloud-postgres.cloud.svc.cluster.local", Port: 5432}, "redis": {Host: "cloud-redis.cloud.svc.cluster.local", Port: 6379}},
		StorageURL: "http://cloud-storage.cloud.svc.cluster.local:8080"})
}

func TestDatabasesAndBuckets(t *testing.T) {
	cluster := newCluster(
		cm("db-main", map[string]string{service.LabelDatabase: "main", service.LabelEngine: "postgres"}),
		cm("db-cache-1", map[string]string{service.LabelDatabase: "cache-1", service.LabelEngine: "redis"}),
		cm("db-old", map[string]string{service.LabelDatabase: "old", service.LabelEngine: "mysql"}),
		cm("wrong-name", map[string]string{service.LabelDatabase: "main", service.LabelEngine: "postgres"}),
		cm("bucket-site", map[string]string{service.LabelBucket: "site"}),
	)
	pg, rd := &fakeEngine{users: map[string]string{}}, &fakeEngine{users: map[string]string{}}
	ctl := newController(cluster, pg, rd)
	ctx := context.Background()
	if err := ctl.Reconcile(ctx); err != nil {
		t.Fatal(err)
	}
	main := cluster.data["/db-main"]
	pw := service.DatabasePassword(key, "postgres", "main")
	if pg.users["main"] != pw || main["URL"] != "postgres://main:"+pw+"@cloud-postgres.cloud.svc.cluster.local:5432/main?sslmode=disable" {
		t.Fatalf("postgres: %v", main)
	}
	if cache := cluster.data["/db-cache-1"]; cache["PREFIX"] != "cache-1:" || !strings.HasPrefix(cache["URL"], "redis://cache-1:") {
		t.Fatalf("redis: %v", cache)
	}
	if b := cluster.data["/bucket-site"]; b["URL"] != "http://cloud-storage.cloud.svc.cluster.local:8080/b/site" || len(b["TOKEN"]) != 64 {
		t.Fatalf("bucket: %v", b)
	}
	status := map[string]string{}
	for _, c := range cluster.configMaps {
		status[c.Name] = c.Annotations[service.AnnotationStatus]
	}
	if status["db-main"] != "ready" || !strings.Contains(status["db-old"], "mysql") || status["wrong-name"] != "" {
		t.Fatalf("status: %v", status)
	}
	// 2 回目は何も変わらない（状態も書き直さない）
	n := cluster.annotated
	if err := ctl.Reconcile(ctx); err != nil || cluster.annotated != n {
		t.Fatalf("2 回目: %v %d→%d", err, n, cluster.annotated)
	}
	// 定義が消えたら Secret を消し、ログインを止める（中身は消さない）
	cluster.configMaps = cluster.configMaps[1:2]
	if err := ctl.Reconcile(ctx); err != nil {
		t.Fatal(err)
	}
	if len(cluster.secrets) != 1 || len(pg.disabled) != 1 || pg.disabled[0] != "main" || len(rd.disabled) != 0 {
		t.Fatalf("消したあと: %v %v", cluster.secrets, pg.disabled)
	}
	rd.err = errors.New("connection refused")
	_ = ctl.Reconcile(ctx)
	if s := cluster.configMaps[0].Annotations[service.AnnotationStatus]; !strings.Contains(s, "connection refused") {
		t.Fatalf("status: %s", s)
	}
}

func TestFunctionNamespaces(t *testing.T) {
	cluster := newCluster(
		cm("db-main", map[string]string{service.LabelDatabase: "main", service.LabelEngine: "postgres"}),
		cm("bucket-site", map[string]string{service.LabelBucket: "site"}),
		registration("blog", "main", "site"),
		registration("api", "", ""),
		registration("waits", "none", ""),
	)
	ctl := newController(cluster, &fakeEngine{users: map[string]string{}}, &fakeEngine{users: map[string]string{}})
	ctx := context.Background()
	if err := ctl.Reconcile(ctx); err != nil {
		t.Fatal(err)
	}

	// 関数ごとに namespace と囲いができる
	ns := cluster.namespaces["taramanji-cloud-fn-blog"]
	if ns["pod-security.kubernetes.io/enforce"] != "baseline" || ns["cloud.taramanji.com/registry"] != "taramanji-cloud-apps" || ns[service.LabelFunction] != "blog" {
		t.Fatalf("namespace labels: %v", ns)
	}
	for _, o := range []string{"resourcequotas/function", "resourcequotas/require-cloud-priority", "limitranges/function",
		"networkpolicies/default-deny", "networkpolicies/function", "serviceaccounts/default", "rolebindings/cloud-gw", "rolebindings/cloud-api"} {
		if _, ok := cluster.objects["taramanji-cloud-fn-blog/"+o]; !ok {
			t.Errorf("%s がない", o)
		}
	}
	hard := cluster.objects["taramanji-cloud-fn-blog/resourcequotas/function"]["spec"].(map[string]any)["hard"].(map[string]string)
	if hard["limits.memory"] != "512Mi" || hard["pods"] != "2" {
		t.Fatalf("quota: %v", hard)
	}

	// 接続先は、つないだ関数の namespace にだけ置く
	if cluster.data["taramanji-cloud-fn-blog/db-main"]["URL"] == "" || cluster.data["taramanji-cloud-fn-blog/bucket-site"]["TOKEN"] == "" {
		t.Fatal("つないだものの Secret がない")
	}
	if _, ok := cluster.secrets["taramanji-cloud-fn-api/db-main"]; ok {
		t.Fatal("つないでいない関数に Secret を置いてはいけない")
	}
	status := map[string]string{}
	for _, c := range cluster.configMaps {
		status[c.Name] = c.Annotations[service.AnnotationStatus]
	}
	if status["function-blog"] != "ready" || status["function-api"] != "ready" || !strings.Contains(status["function-waits"], "データベース none") {
		t.Fatalf("status: %v", status)
	}

	// つなぐものを外すと、その Secret も消える
	cluster.configMaps[2] = registration("blog", "", "site")
	if err := ctl.Reconcile(ctx); err != nil {
		t.Fatal(err)
	}
	if _, ok := cluster.secrets["taramanji-cloud-fn-blog/db-main"]; ok {
		t.Fatal("外したデータベースの Secret が残っている")
	}

	// 登録が消えたら namespace ごと消す。手で作った・ほかの環境の namespace には触れない
	cluster.namespaces["taramanji-cloud-stg-fn-x"] = map[string]string{labelManaged: managedValue, labelRegistry: "taramanji-cloud-stg-apps", service.LabelFunction: "x"}
	cluster.namespaces["taramanji-cloud-fn-hand"] = map[string]string{service.LabelFunction: "hand"}
	cluster.configMaps = cluster.configMaps[:3]
	if err := ctl.Reconcile(ctx); err != nil {
		t.Fatal(err)
	}
	if _, ok := cluster.namespaces["taramanji-cloud-fn-api"]; ok {
		t.Fatal("登録が消えた関数の namespace が残っている")
	}
	for _, keep := range []string{"taramanji-cloud-fn-blog", "taramanji-cloud-stg-fn-x", "taramanji-cloud-fn-hand"} {
		if _, ok := cluster.namespaces[keep]; !ok {
			t.Errorf("%s を消してはいけない", keep)
		}
	}
}

func TestPullSecret(t *testing.T) {
	cluster := newCluster(registration("blog", "", ""))
	ctl := newController(cluster, &fakeEngine{users: map[string]string{}}, &fakeEngine{users: map[string]string{}})
	ctx := context.Background()
	// 認証情報がなければ、Secret も imagePullSecrets も置かない
	if err := ctl.Reconcile(ctx); err != nil {
		t.Fatal(err)
	}
	sa := cluster.objects["taramanji-cloud-fn-blog/serviceaccounts/default"]
	if _, ok := sa["imagePullSecrets"]; ok || sa["automountServiceAccountToken"] != false {
		t.Fatalf("sa: %v", sa)
	}
	if _, ok := cluster.secrets["taramanji-cloud-fn-blog/"+PullSecretName]; ok {
		t.Fatal("認証情報がないのに Secret がある")
	}
	// あれば、関数の namespace に置き、default の ServiceAccount から使う（トークンは持たせないまま）
	cfg := `{"auths":{"ghcr.io":{"auth":"eDp5"}}}`
	ctl.c.PullSecret = cfg
	if err := ctl.Reconcile(ctx); err != nil {
		t.Fatal(err)
	}
	if got := cluster.data["taramanji-cloud-fn-blog/"+PullSecretName][gateway.DockerConfigKey]; got != cfg {
		t.Fatalf("secret: %q", got)
	}
	sa = cluster.objects["taramanji-cloud-fn-blog/serviceaccounts/default"]
	if ps, _ := sa["imagePullSecrets"].([]any); len(ps) != 1 || sa["automountServiceAccountToken"] != false {
		t.Fatalf("sa: %v", sa)
	}
	// 外すと Secret も消える
	ctl.c.PullSecret = ""
	if err := ctl.Reconcile(ctx); err != nil {
		t.Fatal(err)
	}
	if _, ok := cluster.secrets["taramanji-cloud-fn-blog/"+PullSecretName]; ok {
		t.Fatal("外した認証情報の Secret が残っている")
	}
}

func TestRegistrationValidation(t *testing.T) {
	cluster := newCluster(cm("function-bad", map[string]string{service.LabelFunction: "bad"}, map[string]string{"cpuMillis": "99999", "memoryMiB": "256"}))
	ctl := newController(cluster, &fakeEngine{users: map[string]string{}}, &fakeEngine{users: map[string]string{}})
	if err := ctl.Reconcile(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(cluster.namespaces) != 0 || !strings.Contains(cluster.configMaps[0].Annotations[service.AnnotationStatus], "読めません") {
		t.Fatalf("上限を超える登録では namespace を作らない: %v", cluster.namespaces)
	}
}

func sealed(name, value string) gateway.LabeledObject {
	return gateway.LabeledObject{Name: "secret-" + name, Labels: map[string]string{service.LabelKind: service.KindSecret, service.LabelSecret: name},
		Data: map[string]string{service.SecretValueKey: value}}
}

func TestSecrets(t *testing.T) {
	reg := registration("blog", "", "")
	reg.Data[service.RegistrationSecrets] = "anthropic,passcode"
	cluster := newCluster(reg, registration("other", "", ""))
	cluster.shared = []gateway.LabeledObject{sealed("anthropic", "sk-1"),
		// 名前の決まりに合わないものは使わない
		{Name: "secret-x", Labels: map[string]string{service.LabelSecret: "passcode"}, Data: map[string]string{service.SecretValueKey: "wrong"}}}
	ctl := newController(cluster, &fakeEngine{users: map[string]string{}}, &fakeEngine{users: map[string]string{}})
	ctx := context.Background()
	if err := ctl.Reconcile(ctx); err != nil {
		t.Fatal(err)
	}
	// まだ復号されていないシークレットがあれば、状態に書き、Pod は入れ替えない
	if st := cluster.configMaps[0].Annotations[service.AnnotationStatus]; !strings.Contains(st, "シークレット passcode") {
		t.Fatalf("status: %s", st)
	}
	if got := cluster.data["taramanji-cloud-fn-blog/secret-anthropic"]; got[service.SecretValueKey] != "sk-1" {
		t.Fatalf("写したシークレット: %v", got)
	}
	if l := cluster.secrets["taramanji-cloud-fn-blog/secret-anthropic"].Labels; l[labelManaged] != managedValue || l[service.LabelSecret] != "anthropic" {
		t.Fatalf("labels: %v", l)
	}
	// つないでいない関数には置かない
	for k := range cluster.secrets {
		if strings.HasPrefix(k, "taramanji-cloud-fn-other/secret-") {
			t.Fatalf("つないでいない関数に %s", k)
		}
	}

	// 復号されたら使えるようになり、動いている関数の Pod テンプレートに値の印を書く
	cluster.shared = append(cluster.shared, sealed("passcode", "1234"))
	cluster.deployments["taramanji-cloud-fn-blog/blog"] = map[string]string{}
	if err := ctl.Reconcile(ctx); err != nil {
		t.Fatal(err)
	}
	if st := cluster.configMaps[0].Annotations[service.AnnotationStatus]; st != service.StatusReady {
		t.Fatalf("status: %s", st)
	}
	v1 := cluster.deployments["taramanji-cloud-fn-blog/blog"][service.AnnotationSecretsVersion]
	if len(v1) != 16 || strings.Contains(v1, "1234") || cluster.podPatches != 1 {
		t.Fatalf("印: %q %d", v1, cluster.podPatches)
	}
	// 値が同じなら書かない（Pod は入れ替わらない）
	if err := ctl.Reconcile(ctx); err != nil || cluster.podPatches != 1 {
		t.Fatalf("同じ値: %v %d", err, cluster.podPatches)
	}
	// 値が変わったら、写したものも印も変わる
	cluster.shared[2] = sealed("passcode", "5678")
	if err := ctl.Reconcile(ctx); err != nil {
		t.Fatal(err)
	}
	if cluster.data["taramanji-cloud-fn-blog/secret-passcode"][service.SecretValueKey] != "5678" ||
		cluster.deployments["taramanji-cloud-fn-blog/blog"][service.AnnotationSecretsVersion] == v1 || cluster.podPatches != 2 {
		t.Fatalf("変えたあと: %v %d", cluster.deployments, cluster.podPatches)
	}
	// 印はマスターキーで変わる（値だけからは作れない）
	values := map[string]string{"anthropic": "sk-1", "passcode": "5678"}
	if SecretsVersion(key, []string{"passcode", "anthropic"}, values) != SecretsVersion(key, []string{"anthropic", "passcode"}, values) ||
		SecretsVersion([]byte("other"), []string{"anthropic", "passcode"}, values) == SecretsVersion(key, []string{"anthropic", "passcode"}, values) {
		t.Fatal("印は名前の順によらず、マスターキーで変わる")
	}

	// 外したシークレットは関数の namespace から消える
	cluster.configMaps[0].Data[service.RegistrationSecrets] = "anthropic"
	if err := ctl.Reconcile(ctx); err != nil {
		t.Fatal(err)
	}
	if _, ok := cluster.secrets["taramanji-cloud-fn-blog/secret-passcode"]; ok {
		t.Fatal("外したシークレットが残っている")
	}
	if _, ok := cluster.secrets["taramanji-cloud-fn-blog/secret-anthropic"]; !ok {
		t.Fatal("つないだままのシークレットまで消えた")
	}
}
