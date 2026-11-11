package usecase

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/service"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/cfaccess"
)

// fakeStore はメモリの上のリポジトリ（キーは「種類/名前」）。版は保存のたびに増える
type fakeStore struct {
	files    map[string]gateway.ResourceFile
	messages []string
	n        int
}

func (f *fakeStore) List(_ context.Context, kind string) ([]gateway.ResourceFile, error) {
	out := []gateway.ResourceFile{}
	for k, v := range f.files {
		if strings.HasPrefix(k, kind+"/") {
			out = append(out, v)
		}
	}
	return out, nil
}

func (f *fakeStore) Get(_ context.Context, kind, name string) (gateway.ResourceFile, error) {
	v, ok := f.files[kind+"/"+name]
	if !ok {
		return gateway.ResourceFile{}, gateway.ErrResourceNotFound
	}
	return v, nil
}

func (f *fakeStore) Put(_ context.Context, kind, name, yaml, revision, message string) (string, error) {
	k := kind + "/" + name
	if cur, ok := f.files[k]; (ok && cur.Revision != revision) || (!ok && revision != "") {
		return "", gateway.ErrResourceConflict
	}
	f.n++
	f.files[k] = gateway.ResourceFile{Name: name, YAML: yaml, Revision: "r" + strconv.Itoa(f.n)}
	f.messages = append(f.messages, message)
	return f.files[k].Revision, nil
}

func (f *fakeStore) Delete(_ context.Context, kind, name, revision, _ string) error {
	k := kind + "/" + name
	cur, ok := f.files[k]
	if !ok {
		return gateway.ErrResourceNotFound
	}
	if cur.Revision != revision {
		return gateway.ErrResourceConflict
	}
	delete(f.files, k)
	return nil
}

func (f *fakeStore) URL(kind, name string) string {
	return "https://github.com/me/apps/blob/main/prod/" + kind + "/" + name + ".yaml"
}

type fakeMonitors struct {
	items map[int64]gateway.Monitor
	n     int64
	err   error
}

func (f *fakeMonitors) List(context.Context, []string) ([]gateway.Monitor, error) {
	out := []gateway.Monitor{}
	for _, m := range f.items {
		out = append(out, m)
	}
	return out, f.err
}

func (f *fakeMonitors) Create(_ context.Context, m gateway.Monitor) error {
	f.n++
	m.ID = f.n
	f.items[m.ID] = m
	return nil
}

func (f *fakeMonitors) Update(_ context.Context, m gateway.Monitor) error {
	f.items[m.ID] = m
	return nil
}

func (f *fakeMonitors) Delete(_ context.Context, id int64) error {
	delete(f.items, id)
	return nil
}

func newComputeUC() (*ConsoleUsecaseImpl, *fakeStore, *fakeMonitors) {
	store := &fakeStore{files: map[string]gateway.ResourceFile{}}
	mon := &fakeMonitors{items: map[int64]gateway.Monitor{}}
	uc := NewConsoleUsecase(Deps{Environment: "prod",
		APITarget:   service.APITarget{HostSuffix: "-cloud.taramanji.com", InvokerNamespace: "cloud"},
		IdleTimeout: 5 * time.Minute,
		Capacity:    &fakeCapacity{workloads: []gateway.Workload{{Name: "blog", Ready: 0, Desired: 0}}},
		Apps:        store, AppsRepository: "me/apps", Monitors: mon,
		AlertScope: service.AlertScope{Environment: "prod", Cluster: "taramanji-kind", Namespace: "cloud-apps", APMEnv: "prod", InvokerService: "cloud-gw"}})
	return uc, store, mon
}

func blogSpec() *FunctionSpec {
	return &FunctionSpec{Name: "blog", Image: "ghcr.io/me/blog:v1", Port: 8080, InstanceType: "t1.medium",
		Alerts: []string{"cpu-high", "errors"}, Notify: []string{"mail", "discord"}}
}

func TestHostingOptions(t *testing.T) {
	uc, _, _ := newComputeUC()
	out, err := uc.GetHostingOptions(context.Background(), GetHostingOptionsInput{})
	if err != nil {
		t.Fatal(err)
	}
	if len(out.InstanceTypes) != 4 || out.InstanceTypes[0].Name != "t1.small" || out.InstanceTypes[0].Family != "t1" ||
		len(out.AlertPresets) != len(service.AlertPresets) || !out.StoreEnabled || !out.AlertsEnabled || out.Directory != "prod" ||
		out.IdleTimeoutSeconds != 300 || out.HostSuffix != "-cloud.taramanji.com" {
		t.Fatalf("options: %+v", out)
	}
	off, _ := newUC(nil).GetHostingOptions(context.Background(), GetHostingOptionsInput{})
	if off.StoreEnabled || off.AlertsEnabled {
		t.Fatal("リポジトリも Datadog もなければ使えない")
	}
	if _, err := newUC(nil).ListFunctions(context.Background(), ListFunctionsInput{}); code(err) != "store_disabled" {
		t.Fatalf("store_disabled: %v", err)
	}
}

func TestFunctionLifecycle(t *testing.T) {
	uc, store, mon := newComputeUC()
	ctx := cfaccess.WithEmail(context.Background(), "me@example.com")

	// フォームの定義から作る。YAML がリポジトリに入り、選んだ監視が Datadog のモニターになる
	created, err := uc.ApplyFunction(ctx, ApplyFunctionInput{Spec: blogSpec()})
	if err != nil {
		t.Fatal(err)
	}
	fn := created.Function
	if fn.Source.Revision != "r1" || !fn.Source.FormEditable || fn.CustomResources || !fn.Deployed || fn.Ready != 0 ||
		fn.Spec.CpuMillis != 250 || created.AlertsProblem != "" || !strings.HasSuffix(fn.Source.URL, "/prod/functions/blog.yaml") {
		t.Fatalf("function: %+v %+v", fn, fn.Source)
	}
	if !strings.Contains(store.messages[0], "create(prod): function blog (by me@example.com)") || len(mon.items) != 2 {
		t.Fatalf("コミットとモニター: %v %d", store.messages, len(mon.items))
	}

	// 同じ名前でもう一度作ると、上書きせずに止める
	if _, err := uc.ApplyFunction(ctx, ApplyFunctionInput{Spec: blogSpec()}); code(err) != "conflict" {
		t.Fatalf("conflict: %v", err)
	}

	// 型を選んだあとに CPU・メモリを変える。監視を 1 つ外すとモニターも消える
	spec := blogSpec()
	spec.CpuMillis, spec.Memory, spec.Alerts = 400, 300<<20, []string{"cpu-high"}
	updated, err := uc.ApplyFunction(ctx, ApplyFunctionInput{Spec: spec, Revision: "r1"})
	if err != nil || !updated.Function.CustomResources || updated.Function.Spec.InstanceType != "t1.medium" || len(mon.items) != 1 {
		t.Fatalf("update: %+v %v monitors=%d", updated, err, len(mon.items))
	}

	// YAML をそのまま渡す。手で足した ConfigMap があるので、フォームでは編集できない
	y := updated.Function.Source.Yaml + "---\napiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: blog-config\n"
	byYAML, err := uc.ApplyFunction(ctx, ApplyFunctionInput{Spec: &FunctionSpec{Name: "blog"}, Yaml: y, Revision: updated.Function.Source.Revision})
	if err != nil || byYAML.Function.Source.FormEditable || byYAML.Function.Source.Yaml != y {
		t.Fatalf("yaml: %+v %v", byYAML, err)
	}
	rev := byYAML.Function.Source.Revision
	if _, err := uc.ApplyFunction(ctx, ApplyFunctionInput{Spec: &FunctionSpec{Name: "blog"}, Yaml: strings.Replace(y, "ConfigMap", "Secret", 1), Revision: rev}); code(err) != "invalid" {
		t.Fatalf("invalid: %v", err)
	}

	// API を作って関数に渡す。ない関数には渡せない
	api := &ApiSpec{Name: "shop", Routes: []*ApiRoute{{Path: "/", Function: "blog"}}}
	if _, err := uc.ApplyApi(ctx, ApplyApiInput{Spec: &ApiSpec{Name: "shop", Routes: []*ApiRoute{{Path: "/", Function: "none"}}}}); code(err) != "invalid" {
		t.Fatalf("ない関数: %v", err)
	}
	madeAPI, err := uc.ApplyApi(ctx, ApplyApiInput{Spec: api})
	if err != nil || madeAPI.API.Host != "shop-cloud.taramanji.com" || !madeAPI.API.Source.FormEditable || len(madeAPI.API.Spec.Routes) != 1 {
		t.Fatalf("api: %+v %v", madeAPI, err)
	}
	list, err := uc.ListFunctions(ctx, ListFunctionsInput{})
	if err != nil || len(list.Functions) != 1 || len(list.Functions[0].Apis) != 1 || list.Functions[0].Apis[0] != "shop" {
		t.Fatalf("関数に渡している API: %+v %v", list, err)
	}
	apis, err := uc.ListApis(ctx, ListApisInput{})
	if err != nil || len(apis.Apis) != 1 || apis.Apis[0].Spec.Routes[0].Function != "blog" {
		t.Fatalf("apis: %+v %v", apis, err)
	}

	// API が渡している関数は消せない。API を消せば消せる
	if _, err := uc.DeleteFunction(ctx, DeleteFunctionInput{Name: "blog", Revision: rev}); code(err) != "function_in_use" {
		t.Fatalf("function_in_use: %v", err)
	}
	if _, err := uc.DeleteApi(ctx, DeleteApiInput{Name: "shop", Revision: "old"}); code(err) != "conflict" {
		t.Fatalf("古い版では消せない: %v", err)
	}
	if _, err := uc.DeleteApi(ctx, DeleteApiInput{Name: "shop", Revision: madeAPI.API.Source.Revision}); err != nil {
		t.Fatal(err)
	}
	if _, err := uc.DeleteFunction(ctx, DeleteFunctionInput{Name: "blog", Revision: rev}); err != nil || len(store.files) != 0 || len(mon.items) != 0 {
		t.Fatalf("delete: %v files=%d monitors=%d", err, len(store.files), len(mon.items))
	}
}

func TestListKeepsBrokenYAML(t *testing.T) {
	uc, store, mon := newComputeUC()
	ctx := context.Background()
	if _, err := uc.ApplyFunction(ctx, ApplyFunctionInput{Spec: blogSpec()}); err != nil {
		t.Fatal(err)
	}
	// git に直接 push された、読めない YAML
	store.files["functions/broken"] = gateway.ResourceFile{Name: "broken", YAML: "kind: Secret\nmetadata:\n  name: broken\n", Revision: "x"}
	out, err := uc.ListFunctions(ctx, ListFunctionsInput{})
	if err != nil || len(out.Functions) != 2 || out.Functions[1].Spec.Name != "broken" || out.Functions[1].Source.Problem == "" || out.Functions[0].Source.Problem != "" {
		t.Fatalf("list: %+v %v", out, err)
	}
	// 読めない YAML があるあいだは、ほかの関数のモニターを消さない
	if _, err := uc.SyncAlerts(ctx, SyncAlertsInput{}); code(err) != "alerts_failed" || len(mon.items) != 2 {
		t.Fatalf("alerts_failed: %v monitors=%d", err, len(mon.items))
	}
	delete(store.files, "functions/broken")
	mon.err = errors.New("datadog down")
	if out, err := uc.ApplyFunction(ctx, ApplyFunctionInput{Spec: blogSpec(), Revision: "r1"}); err != nil || out.AlertsProblem == "" {
		t.Fatalf("Datadog が落ちていても YAML は保存する: %+v %v", out, err)
	}
}

func TestPreview(t *testing.T) {
	uc, store, _ := newComputeUC()
	ctx := context.Background()
	out, err := uc.PreviewFunction(ctx, PreviewFunctionInput{Spec: blogSpec()})
	if err != nil || !strings.Contains(out.Yaml, "kind: Deployment") || len(store.files) != 0 {
		t.Fatalf("preview: %v", err)
	}
	bad := blogSpec()
	bad.InstanceType = "m5.large"
	if _, err := uc.PreviewFunction(ctx, PreviewFunctionInput{Spec: bad}); code(err) != "invalid" {
		t.Fatalf("invalid: %v", err)
	}
	api, err := uc.PreviewApi(ctx, PreviewApiInput{Spec: &ApiSpec{Name: "shop", Routes: []*ApiRoute{{Path: "/", Function: "blog"}}}})
	if err != nil || !strings.Contains(api.Yaml, "kind: HTTPRoute") {
		t.Fatalf("api preview: %v", err)
	}
	if _, err := uc.PreviewApi(ctx, PreviewApiInput{Spec: &ApiSpec{Name: "shop"}}); code(err) != "invalid" {
		t.Fatalf("invalid: %v", err)
	}
}

type fakeObjects struct {
	objects map[string][]gateway.StoredObject
}

func (f *fakeObjects) Buckets(context.Context) ([]gateway.BucketUsage, error) {
	out := []gateway.BucketUsage{}
	for name, objs := range f.objects {
		out = append(out, gateway.BucketUsage{Name: name, Objects: int64(len(objs))})
	}
	return out, nil
}

func (f *fakeObjects) List(_ context.Context, bucket, _ string) ([]gateway.StoredObject, bool, error) {
	objs, ok := f.objects[bucket]
	if !ok {
		return nil, false, gateway.ErrObjectNotFound
	}
	return objs, false, nil
}

func (f *fakeObjects) Delete(_ context.Context, bucket, key string) error {
	for i, o := range f.objects[bucket] {
		if o.Key == key {
			f.objects[bucket] = append(f.objects[bucket][:i], f.objects[bucket][i+1:]...)
			return nil
		}
	}
	return gateway.ErrObjectNotFound
}

func (f *fakeObjects) Proxy(http.ResponseWriter, *http.Request, string, string) {}

type fakeDNS struct {
	hosts map[string]bool
	err   error
}

func (f *fakeDNS) Ensure(_ context.Context, host string) error {
	if f.err == nil {
		f.hosts[host] = true
	}
	return f.err
}

func (f *fakeDNS) Remove(_ context.Context, host string) error {
	delete(f.hosts, host)
	return nil
}

func TestBucketsAndCDN(t *testing.T) {
	uc, store, _ := newComputeUC()
	objs := &fakeObjects{objects: map[string][]gateway.StoredObject{}}
	dns := &fakeDNS{hosts: map[string]bool{}}
	uc.d.Objects, uc.d.DNS = objs, dns
	ctx := context.Background()

	made, err := uc.CreateBucket(ctx, CreateBucketInput{Name: "site"})
	if err != nil || made.Bucket.Ready || !strings.Contains(made.Bucket.Source.Yaml, "cloud.taramanji.com/bucket: site") {
		t.Fatalf("create: %+v %v", made, err)
	}
	if _, err := uc.CreateBucket(ctx, CreateBucketInput{Name: "site"}); code(err) != "conflict" {
		t.Fatalf("同じ名前: %v", err)
	}
	if _, err := uc.CreateBucket(ctx, CreateBucketInput{Name: "Bad"}); code(err) != "invalid" {
		t.Fatalf("invalid: %v", err)
	}
	// ストレージがバケットを作ると、使用量が出る
	objs.objects["site"] = []gateway.StoredObject{{Key: "index.html", Size: 4}}
	list, err := uc.ListBuckets(ctx, ListBucketsInput{})
	if err != nil || len(list.Buckets) != 1 || !list.Buckets[0].Ready || list.Buckets[0].Objects != 1 {
		t.Fatalf("list: %+v %v", list, err)
	}

	// CDN: ない元には向けられない。作るとホスト名の DNS が登録される
	spec := &DistributionSpec{Name: "www", OriginType: "bucket", Origin: "none", CacheSeconds: 300, Spa: true}
	if _, err := uc.ApplyDistribution(ctx, ApplyDistributionInput{Spec: spec}); code(err) != "invalid" {
		t.Fatalf("ない元: %v", err)
	}
	spec.Origin = "site"
	dist, err := uc.ApplyDistribution(ctx, ApplyDistributionInput{Spec: spec})
	if err != nil || dist.Distribution.Host != "www-cloud.taramanji.com" || dist.DnsProblem != "" || !dns.hosts["www-cloud.taramanji.com"] ||
		!dist.Distribution.Spec.Spa || dist.Distribution.Spec.CacheSeconds != 300 {
		t.Fatalf("cdn: %+v %v", dist, err)
	}
	// API と CDN は同じホスト名を使えない（どちらが先でも）
	if _, err := uc.ApplyFunction(ctx, ApplyFunctionInput{Spec: blogSpec()}); err != nil {
		t.Fatal(err)
	}
	if _, err := uc.ApplyApi(ctx, ApplyApiInput{Spec: &ApiSpec{Name: "www", Routes: []*ApiRoute{{Path: "/", Function: "blog"}}}}); code(err) != "host_taken" {
		t.Fatalf("host_taken: %v", err)
	}
	api, err := uc.ApplyApi(ctx, ApplyApiInput{Spec: &ApiSpec{Name: "shop", Routes: []*ApiRoute{{Path: "/", Function: "blog"}}}})
	if err != nil || !dns.hosts["shop-cloud.taramanji.com"] {
		t.Fatalf("api の DNS: %v", err)
	}
	if _, err := uc.ApplyDistribution(ctx, ApplyDistributionInput{Spec: &DistributionSpec{Name: "shop", OriginType: "function", Origin: "blog"}}); code(err) != "host_taken" {
		t.Fatalf("host_taken: %v", err)
	}
	// DNS に失敗しても YAML は保存し、理由を返す
	dns.err = errors.New("cloudflare down")
	fnDist, err := uc.ApplyDistribution(ctx, ApplyDistributionInput{Spec: &DistributionSpec{Name: "fast", OriginType: "function", Origin: "blog", CacheSeconds: 60}})
	if err != nil || fnDist.DnsProblem == "" || store.files["cdn/fast"].YAML == "" {
		t.Fatalf("dns_problem: %+v %v", fnDist, err)
	}
	dns.err = nil

	// 使われている元は消せない。中身のあるバケットも消せない
	if _, err := uc.DeleteFunction(ctx, DeleteFunctionInput{Name: "blog", Revision: store.files["functions/blog"].Revision}); code(err) != "function_in_use" {
		t.Fatalf("function_in_use: %v", err)
	}
	rev := store.files["buckets/site"].Revision
	if err := uc.DeleteBucket(ctx, DeleteBucketInput{Name: "site", Revision: rev}); code(err) != "bucket_in_use" {
		t.Fatalf("bucket_in_use: %v", err)
	}
	if out, err := uc.DeleteDistribution(ctx, DeleteDistributionInput{Name: "www", Revision: dist.Distribution.Source.Revision}); err != nil || out.DnsProblem != "" || dns.hosts["www-cloud.taramanji.com"] {
		t.Fatalf("delete cdn: %v", err)
	}
	if err := uc.DeleteBucket(ctx, DeleteBucketInput{Name: "site", Revision: rev}); code(err) != "bucket_not_empty" {
		t.Fatalf("bucket_not_empty: %v", err)
	}
	if err := uc.DeleteObject(ctx, DeleteObjectInput{Bucket: "site", Key: "index.html"}); err != nil {
		t.Fatal(err)
	}
	if err := uc.DeleteObject(ctx, DeleteObjectInput{Bucket: "site", Key: "index.html"}); code(err) != "not_found" {
		t.Fatalf("not_found: %v", err)
	}
	if err := uc.DeleteBucket(ctx, DeleteBucketInput{Name: "site", Revision: rev}); err != nil {
		t.Fatal(err)
	}
	if out, err := uc.DeleteApi(ctx, DeleteApiInput{Name: "shop", Revision: api.API.Source.Revision}); err != nil || out.DnsProblem != "" || dns.hosts["shop-cloud.taramanji.com"] {
		t.Fatalf("api の DNS を消す: %v", err)
	}
}

type fakeState []gateway.LabeledObject

func (f fakeState) ConfigMaps(context.Context, string) ([]gateway.LabeledObject, error) {
	return f, nil
}

func TestDatabasesAndConnections(t *testing.T) {
	uc, store, _ := newComputeUC()
	uc.d.State = fakeState{{Name: "db-main", Labels: map[string]string{service.LabelDatabase: "main"}, Annotations: map[string]string{service.AnnotationStatus: "ready"}}}
	ctx := context.Background()

	made, err := uc.CreateDatabase(ctx, CreateDatabaseInput{Name: "main", Engine: "postgres"})
	if err != nil || made.Database.Ready || made.Database.Status != "pending" || made.Database.EnvNames[0] != "DB_MAIN_URL" {
		t.Fatalf("create: %+v %v", made, err)
	}
	if _, err := uc.CreateDatabase(ctx, CreateDatabaseInput{Name: "x", Engine: "mysql"}); code(err) != "invalid" {
		t.Fatalf("engine: %v", err)
	}
	if _, err := uc.CreateDatabase(ctx, CreateDatabaseInput{Name: "main", Engine: "redis"}); code(err) != "conflict" {
		t.Fatalf("同じ名前: %v", err)
	}
	if _, err := uc.CreateDatabase(ctx, CreateDatabaseInput{Name: "cache", Engine: "redis"}); err != nil {
		t.Fatal(err)
	}
	if _, err := uc.CreateBucket(ctx, CreateBucketInput{Name: "site"}); err != nil {
		t.Fatal(err)
	}

	// ないものはつなげない。あるものをつなぐと、YAML に envFrom が入る
	spec := blogSpec()
	spec.Databases, spec.Buckets = []string{"none"}, []string{"site"}
	if _, err := uc.ApplyFunction(ctx, ApplyFunctionInput{Spec: spec}); code(err) != "invalid" {
		t.Fatalf("ないデータベース: %v", err)
	}
	spec.Databases = []string{"main"}
	fn, err := uc.ApplyFunction(ctx, ApplyFunctionInput{Spec: spec})
	if err != nil || !strings.Contains(fn.Function.Source.Yaml, "prefix: DB_MAIN_") || !strings.Contains(fn.Function.Source.Yaml, "name: bucket-site") ||
		!fn.Function.Source.FormEditable || fn.Function.Spec.Databases[0] != "main" || fn.Function.Spec.Buckets[0] != "site" {
		t.Fatalf("function: %+v %v", fn, err)
	}

	list, err := uc.ListDatabases(ctx, ListDatabasesInput{})
	if err != nil || len(list.Databases) != 2 || list.Databases[1].Name != "main" || !list.Databases[1].Ready ||
		list.Databases[1].Functions[0] != "blog" || list.Databases[0].Ready || list.Databases[0].Engine != "redis" {
		t.Fatalf("list: %+v %v", list, err)
	}

	// 関数がつないでいるデータベース・バケットは消せない
	if err := uc.DeleteDatabase(ctx, DeleteDatabaseInput{Name: "main", Revision: store.files["databases/main"].Revision}); code(err) != "database_in_use" {
		t.Fatalf("database_in_use: %v", err)
	}
	if err := uc.DeleteBucket(ctx, DeleteBucketInput{Name: "site", Revision: store.files["buckets/site"].Revision}); code(err) != "bucket_in_use" {
		t.Fatalf("bucket_in_use: %v", err)
	}
	if err := uc.DeleteDatabase(ctx, DeleteDatabaseInput{Name: "cache", Revision: store.files["databases/cache"].Revision}); err != nil {
		t.Fatal(err)
	}
}
