package usecase

import (
	"context"
	"encoding/json"
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
		APITarget:   service.APITarget{HostSuffix: "-cloud.taramanji.com", InvokerNamespace: "taramanji-cloud"},
		IdleTimeout: 5 * time.Minute,
		Capacity:    &fakeCapacity{workloads: []gateway.Workload{{Name: "blog", Ready: 0, Desired: 0}}},
		Apps:        store, AppsRepository: "me/apps", Monitors: mon,
		AlertScope: service.AlertScope{Environment: "prod", Cluster: "taramanji-kind", Namespace: "taramanji-cloud-apps", APMEnv: "prod", InvokerService: "cloud-gw"}})
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
	if len(out.InstanceTypes) != 10 || out.InstanceTypes[0].Name != "t1.small" || out.InstanceTypes[0].Family != "t1" || len(out.InstanceFamilies) != 3 || out.InstanceTypes[9].Family != "r1" ||
		len(out.AlertPresets) != len(service.AlertPresets) || !out.StoreEnabled || !out.AlertsEnabled || out.Directory != "prod" ||
		out.IdleTimeoutSeconds != 300 || out.HostSuffix != "-cloud.taramanji.com" {
		t.Fatalf("options: %+v", out)
	}
	// ホスト名はサービスごと（CDN はログインあり、API と公開バケットはログインなし）
	if out.ApiHostSuffix != "-apigw-cloud.taramanji.com" || out.CdnHostSuffix != "-cdn-cloud.taramanji.com" || out.StorageHostSuffix != "-storage-cloud.taramanji.com" {
		t.Fatalf("suffix: %+v", out)
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
	y := updated.Function.Source.Yaml + "---\napiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: blog-config\n  namespace: taramanji-cloud-fn-blog\n"
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
	if err != nil || madeAPI.API.Host != "shop-apigw-cloud.taramanji.com" || !madeAPI.API.Source.FormEditable || len(madeAPI.API.Spec.Routes) != 1 {
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

// API キーと CORS: キーそのものは作ったときに 1 回だけ返り、YAML にはハッシュだけ。フォームで保存してもキーは残る
func TestAPIKeysAndCORS(t *testing.T) {
	uc, store, _ := newComputeUC()
	uc.d.DNS = &fakeDNS{hosts: map[string]bool{}}
	ctx := context.Background()
	if _, err := uc.ApplyFunction(ctx, ApplyFunctionInput{Spec: blogSpec()}); err != nil {
		t.Fatal(err)
	}
	made, err := uc.ApplyApi(ctx, ApplyApiInput{Spec: &ApiSpec{Name: "shop", Routes: []*ApiRoute{{Path: "/", Function: "blog"}}, Auth: "api_key",
		CorsOrigins: []string{"https://front-storage-cloud.taramanji.com/"}}})
	if err != nil || made.API.Spec.Auth != "api_key" || len(made.API.Spec.CorsOrigins) != 1 || made.API.Spec.CorsOrigins[0] != "https://front-storage-cloud.taramanji.com" {
		t.Fatalf("api: %+v %v", made, err)
	}
	k, err := uc.CreateApiKey(ctx, CreateApiKeyInput{API: "shop", Name: "ci", Revision: made.API.Source.Revision})
	if err != nil || !strings.HasPrefix(k.Key, "tck_") || len(k.API.Spec.Keys) != 1 || k.API.Spec.Keys[0].Name != "ci" || k.API.Spec.Keys[0].Prefix != k.Key[:12] {
		t.Fatalf("key: %+v %v", k, err)
	}
	y := store.files["apis/shop"].YAML
	if strings.Contains(y, k.Key) || !strings.Contains(y, service.HashAPIKey(k.Key)) {
		t.Fatalf("YAML にはハッシュだけ:\n%s", y)
	}
	// 同じ名前・古い版では作れない
	if _, err := uc.CreateApiKey(ctx, CreateApiKeyInput{API: "shop", Name: "ci", Revision: k.API.Source.Revision}); code(err) != "invalid" {
		t.Fatalf("同じ名前: %v", err)
	}
	if _, err := uc.CreateApiKey(ctx, CreateApiKeyInput{API: "shop", Name: "web", Revision: made.API.Source.Revision}); err == nil {
		t.Fatal("古い版で作れてしまう")
	}
	// フォームで保存し直しても（キーは送らない）、キーは残る
	saved, err := uc.ApplyApi(ctx, ApplyApiInput{Spec: &ApiSpec{Name: "shop", Routes: []*ApiRoute{{Path: "/", Function: "blog"}}, Auth: "api_key"}, Revision: k.API.Source.Revision})
	if err != nil || len(saved.API.Spec.Keys) != 1 || len(saved.API.Spec.CorsOrigins) != 0 || !strings.Contains(store.files["apis/shop"].YAML, service.HashAPIKey(k.Key)) {
		t.Fatalf("保存し直し: %+v %v", saved, err)
	}
	del, err := uc.DeleteApiKey(ctx, DeleteApiKeyInput{API: "shop", Name: "ci", Revision: saved.API.Source.Revision})
	if err != nil || len(del.API.Spec.Keys) != 0 || strings.Contains(store.files["apis/shop"].YAML, service.HashAPIKey(k.Key)) {
		t.Fatalf("delete: %+v %v", del, err)
	}
	if _, err := uc.DeleteApiKey(ctx, DeleteApiKeyInput{API: "shop", Name: "ci", Revision: del.API.Source.Revision}); code(err) != "not_found" {
		t.Fatalf("ないキー: %v", err)
	}
	// 手で直した YAML の API には、コンソールからキーを作らない（作り直すと手で直したところが消えるため）
	hand := strings.Replace(store.files["apis/shop"].YAML, "    app.kubernetes.io/name: shop", "    app.kubernetes.io/name: shop\n    team: me", 1)
	f := store.files["apis/shop"]
	f.YAML = hand
	store.files["apis/shop"] = f
	if _, err := uc.CreateApiKey(ctx, CreateApiKeyInput{API: "shop", Name: "x", Revision: f.Revision}); code(err) != "not_form_editable" {
		t.Fatalf("手で直した YAML: %v", err)
	}
}

// 公開バケット: オンにすると <バケット>-storage-cloud.taramanji.com の HTTPRoute と DNS ができ、オフ・削除で消える
func TestPublicBucket(t *testing.T) {
	uc, store, _ := newComputeUC()
	dns := &fakeDNS{hosts: map[string]bool{}}
	uc.d.Objects, uc.d.DNS = &fakeObjects{objects: map[string][]gateway.StoredObject{}}, dns
	ctx := context.Background()
	const host = "assets-storage-cloud.taramanji.com"

	// 既定は非公開（HTTPRoute も DNS もない）
	made, err := uc.CreateBucket(ctx, CreateBucketInput{Name: "assets"})
	if err != nil || made.Bucket.Public || made.Bucket.PublicHost != "" || dns.hosts[host] || strings.Contains(store.files["buckets/assets"].YAML, "HTTPRoute") {
		t.Fatalf("private: %+v %v", made, err)
	}
	on, err := uc.UpdateBucket(ctx, UpdateBucketInput{Name: "assets", Public: true, Revision: made.Bucket.Source.Revision})
	if err != nil || !on.Bucket.Public || on.Bucket.PublicHost != host || on.DnsProblem != "" || !dns.hosts[host] ||
		!strings.Contains(store.files["buckets/assets"].YAML, "name: bucket.assets") {
		t.Fatalf("public: %+v %v", on, err)
	}
	// 古い版では変えられない
	if _, err := uc.UpdateBucket(ctx, UpdateBucketInput{Name: "assets", Public: false, Revision: made.Bucket.Source.Revision}); err == nil {
		t.Fatal("古い版で上書きできてしまう")
	}
	list, err := uc.ListBuckets(ctx, ListBucketsInput{})
	if err != nil || len(list.Buckets) != 1 || !list.Buckets[0].Public || list.Buckets[0].PublicHost != host {
		t.Fatalf("list: %+v %v", list, err)
	}
	off, err := uc.UpdateBucket(ctx, UpdateBucketInput{Name: "assets", Public: false, Revision: on.Bucket.Source.Revision})
	if err != nil || off.Bucket.Public || dns.hosts[host] || strings.Contains(store.files["buckets/assets"].YAML, "HTTPRoute") {
		t.Fatalf("off: %+v %v", off, err)
	}
	// 公開で作って消すと、DNS も消える
	pub, err := uc.CreateBucket(ctx, CreateBucketInput{Name: "pub", Public: true})
	if err != nil || !dns.hosts["pub-storage-cloud.taramanji.com"] {
		t.Fatalf("create public: %+v %v", pub, err)
	}
	if out, err := uc.DeleteBucket(ctx, DeleteBucketInput{Name: "pub", Revision: pub.Bucket.Source.Revision}); err != nil || out.DnsProblem != "" || dns.hosts["pub-storage-cloud.taramanji.com"] {
		t.Fatalf("delete: %+v %v", out, err)
	}
}

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
	if err != nil || dist.Distribution.Host != "www-cdn-cloud.taramanji.com" || dist.DnsProblem != "" || !dns.hosts["www-cdn-cloud.taramanji.com"] ||
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
	if err != nil || !dns.hosts["shop-apigw-cloud.taramanji.com"] {
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
	if _, err := uc.DeleteBucket(ctx, DeleteBucketInput{Name: "site", Revision: rev}); code(err) != "bucket_in_use" {
		t.Fatalf("bucket_in_use: %v", err)
	}
	if out, err := uc.DeleteDistribution(ctx, DeleteDistributionInput{Name: "www", Revision: dist.Distribution.Source.Revision}); err != nil || out.DnsProblem != "" || dns.hosts["www-cdn-cloud.taramanji.com"] {
		t.Fatalf("delete cdn: %v", err)
	}
	if _, err := uc.DeleteBucket(ctx, DeleteBucketInput{Name: "site", Revision: rev}); code(err) != "bucket_not_empty" {
		t.Fatalf("bucket_not_empty: %v", err)
	}
	if err := uc.DeleteObject(ctx, DeleteObjectInput{Bucket: "site", Key: "index.html"}); err != nil {
		t.Fatal(err)
	}
	if err := uc.DeleteObject(ctx, DeleteObjectInput{Bucket: "site", Key: "index.html"}); code(err) != "not_found" {
		t.Fatalf("not_found: %v", err)
	}
	if _, err := uc.DeleteBucket(ctx, DeleteBucketInput{Name: "site", Revision: rev}); err != nil {
		t.Fatal(err)
	}
	if out, err := uc.DeleteApi(ctx, DeleteApiInput{Name: "shop", Revision: api.API.Source.Revision}); err != nil || out.DnsProblem != "" || dns.hosts["shop-apigw-cloud.taramanji.com"] {
		t.Fatalf("api の DNS を消す: %v", err)
	}
}

// パスごとの元: 画面（バケット）と API（関数）を同じホスト名にまとめる
func TestCDNBehaviors(t *testing.T) {
	uc, store, _ := newComputeUC()
	uc.d.Objects, uc.d.DNS = &fakeObjects{objects: map[string][]gateway.StoredObject{}}, &fakeDNS{hosts: map[string]bool{}}
	ctx := context.Background()
	if _, err := uc.CreateBucket(ctx, CreateBucketInput{Name: "front"}); err != nil {
		t.Fatal(err)
	}
	spec := &DistributionSpec{Name: "vrst", OriginType: "bucket", Origin: "front", CacheSeconds: 300, Spa: true,
		Behaviors: []*DistributionBehavior{{Path: "/api", OriginType: "function", Origin: "blog"}}}
	// パスごとの元も、ないものには向けられない（欄は behaviors）
	if _, err := uc.ApplyDistribution(ctx, ApplyDistributionInput{Spec: spec}); code(err) != "invalid" {
		t.Fatalf("ない関数: %v", err)
	}
	if _, err := uc.ApplyFunction(ctx, ApplyFunctionInput{Spec: blogSpec()}); err != nil {
		t.Fatal(err)
	}
	out, err := uc.ApplyDistribution(ctx, ApplyDistributionInput{Spec: spec})
	if err != nil || len(out.Distribution.Spec.Behaviors) != 1 || out.Distribution.Spec.Behaviors[0].Origin != "blog" || !out.Distribution.Source.FormEditable {
		t.Fatalf("cdn: %+v %v", out, err)
	}
	if y := store.files["cdn/vrst"].YAML; !strings.Contains(y, "value: /api") || !strings.Contains(y, "value: blog") {
		t.Fatalf("yaml:\n%s", y)
	}
	// パスごとの元として使われている関数も消せない
	if _, err := uc.DeleteFunction(ctx, DeleteFunctionInput{Name: "blog", Revision: store.files["functions/blog"].Revision}); code(err) != "function_in_use" {
		t.Fatalf("function_in_use: %v", err)
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
	if _, err := uc.DeleteBucket(ctx, DeleteBucketInput{Name: "site", Revision: store.files["buckets/site"].Revision}); code(err) != "bucket_in_use" {
		t.Fatalf("bucket_in_use: %v", err)
	}
	if err := uc.DeleteDatabase(ctx, DeleteDatabaseInput{Name: "cache", Revision: store.files["databases/cache"].Revision}); err != nil {
		t.Fatal(err)
	}
}

func TestListDeployments(t *testing.T) {
	uc, _, _ := newComputeUC()
	at := time.Date(2026, 11, 11, 1, 2, 3, 0, time.UTC)
	b, _ := json.Marshal(service.DeployStatus{Kind: "functions", Name: "blog", State: "applied", Revision: "abc1234", Commit: "def5678", At: at,
		History: []service.DeployEvent{{At: at, State: "applied", Revision: "abc1234"}}})
	uc.d.State = fakeState{{Name: service.DeployStatusConfigMap, Labels: map[string]string{service.LabelDeployStatus: "true"},
		Data: map[string]string{"functions.blog": string(b), "broken": "{"}}}
	out, err := uc.ListDeployments(context.Background(), ListDeploymentsInput{})
	if err != nil || !out.Enabled || len(out.Deployments) != 1 || out.Deployments[0].Name != "blog" || out.Deployments[0].AtMs != at.UnixMilli() || len(out.Deployments[0].History) != 1 {
		t.Fatalf("%+v %v", out, err)
	}
}

// 順番を記録する DNS と Access（独自ドメインは、Access に登録してから DNS を作り、DNS を消してから Access から外す）
type orderLog struct{ steps []string }

type loggingDNS struct {
	log   *orderLog
	hosts map[string]bool
}

func (d *loggingDNS) Ensure(_ context.Context, host string) error {
	d.log.steps = append(d.log.steps, "dns+ "+host)
	d.hosts[host] = true
	return nil
}

func (d *loggingDNS) Remove(_ context.Context, host string) error {
	d.log.steps = append(d.log.steps, "dns- "+host)
	delete(d.hosts, host)
	return nil
}

type fakeAccess struct {
	log   *orderLog
	hosts []string
	err   error
}

func (a *fakeAccess) SetHosts(_ context.Context, hosts []string) error {
	if a.err != nil {
		return a.err
	}
	a.log.steps = append(a.log.steps, "access "+strings.Join(hosts, ","))
	a.hosts = hosts
	return nil
}

func TestCDNAliases(t *testing.T) {
	uc, store, _ := newComputeUC()
	log := &orderLog{}
	dns := &loggingDNS{log: log, hosts: map[string]bool{}}
	acc := &fakeAccess{log: log}
	uc.d.Objects, uc.d.DNS, uc.d.Access = &fakeObjects{objects: map[string][]gateway.StoredObject{}}, dns, acc
	uc.d.APITarget.AliasZone = "taramanji.com"
	ctx := context.Background()
	if _, err := uc.CreateBucket(ctx, CreateBucketInput{Name: "front"}); err != nil {
		t.Fatal(err)
	}
	opts, _ := uc.GetHostingOptions(ctx, GetHostingOptionsInput{})
	if opts.CustomDomainZone != "taramanji.com" {
		t.Fatalf("zone: %q", opts.CustomDomainZone)
	}
	base := func(aliases ...string) *DistributionSpec {
		return &DistributionSpec{Name: "vrst", OriginType: "bucket", Origin: "front", CacheSeconds: 300, Aliases: aliases}
	}
	// 作るときは独自ドメインを付けられない（作ってから）
	if _, err := uc.ApplyDistribution(ctx, ApplyDistributionInput{Spec: base("qa.taramanji.com")}); code(err) != "invalid" {
		t.Fatalf("作るとき: %v", err)
	}
	made, err := uc.ApplyDistribution(ctx, ApplyDistributionInput{Spec: base()})
	if err != nil {
		t.Fatal(err)
	}
	// 予約した名前は使えない
	if _, err := uc.ApplyDistribution(ctx, ApplyDistributionInput{Spec: base("www.taramanji.com"), Revision: made.Distribution.Source.Revision}); code(err) != "invalid" {
		t.Fatalf("www: %v", err)
	}
	// Access に登録できなければ、保存も DNS もしない
	acc.err = errors.New("forbidden")
	log.steps = nil
	if _, err := uc.ApplyDistribution(ctx, ApplyDistributionInput{Spec: base("qa.taramanji.com"), Revision: made.Distribution.Source.Revision}); code(err) != "access_failed" {
		t.Fatalf("access 失敗: %v", err)
	}
	if strings.Contains(store.files["cdn/vrst"].YAML, "qa.taramanji.com") || dns.hosts["qa.taramanji.com"] {
		t.Fatal("Access に登録できないのに保存・DNS をした")
	}
	acc.err = nil
	// 足す: Access → DNS の順
	log.steps = nil
	added, err := uc.ApplyDistribution(ctx, ApplyDistributionInput{Spec: base("qa.taramanji.com"), Revision: made.Distribution.Source.Revision})
	if err != nil || added.DnsProblem != "" || len(added.Distribution.Spec.Aliases) != 1 {
		t.Fatalf("add: %+v %v", added, err)
	}
	if strings.Join(log.steps, " | ") != "access qa.taramanji.com | dns+ vrst-cdn-cloud.taramanji.com | dns+ qa.taramanji.com" {
		t.Fatalf("順番: %v", log.steps)
	}
	// ほかの CDN は、同じ独自ドメインを使えない
	if _, err := uc.ApplyDistribution(ctx, ApplyDistributionInput{Spec: &DistributionSpec{Name: "other", OriginType: "bucket", Origin: "front"}}); err != nil {
		t.Fatal(err)
	}
	other := store.files["cdn/other"]
	if _, err := uc.ApplyDistribution(ctx, ApplyDistributionInput{Spec: &DistributionSpec{Name: "other", OriginType: "bucket", Origin: "front", Aliases: []string{"qa.taramanji.com"}}, Revision: other.Revision}); code(err) != "host_taken" {
		t.Fatalf("host_taken: %v", err)
	}
	// 外す: DNS を消してから Access から外す
	log.steps = nil
	removed, err := uc.ApplyDistribution(ctx, ApplyDistributionInput{Spec: base(), Revision: added.Distribution.Source.Revision})
	if err != nil || removed.DnsProblem != "" {
		t.Fatalf("remove: %+v %v", removed, err)
	}
	if strings.Join(log.steps, " | ") != "dns+ vrst-cdn-cloud.taramanji.com | dns- qa.taramanji.com | access " {
		t.Fatalf("外す順番: %v", log.steps)
	}
	// 消す: 独自ドメインの DNS も消し、Access から外す
	again, _ := uc.ApplyDistribution(ctx, ApplyDistributionInput{Spec: base("docs.taramanji.com"), Revision: removed.Distribution.Source.Revision})
	log.steps = nil
	if out, err := uc.DeleteDistribution(ctx, DeleteDistributionInput{Name: "vrst", Revision: again.Distribution.Source.Revision}); err != nil || out.DnsProblem != "" {
		t.Fatalf("delete: %+v %v", out, err)
	}
	if strings.Join(log.steps, " | ") != "dns- vrst-cdn-cloud.taramanji.com | dns- docs.taramanji.com | access " || dns.hosts["docs.taramanji.com"] {
		t.Fatalf("消す順番: %v", log.steps)
	}
	// Access がなければ、独自ドメインは使えない
	uc.d.Access = nil
	if o, _ := uc.GetHostingOptions(ctx, GetHostingOptionsInput{}); o.CustomDomainZone != "" {
		t.Fatal("Access がないのにゾーンを返す")
	}
	other = store.files["cdn/other"]
	if _, err := uc.ApplyDistribution(ctx, ApplyDistributionInput{Spec: &DistributionSpec{Name: "other", OriginType: "bucket", Origin: "front", Aliases: []string{"qa.taramanji.com"}}, Revision: other.Revision}); code(err) != "invalid" {
		t.Fatalf("Access なし: %v", err)
	}
}
