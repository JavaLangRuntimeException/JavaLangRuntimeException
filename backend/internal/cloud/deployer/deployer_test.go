package deployer

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/service"
)

type fakeSource struct {
	head  string
	files map[string][]gateway.ResourceFile
}

func (f *fakeSource) Head(context.Context) (string, error) { return f.head, nil }
func (f *fakeSource) List(_ context.Context, kind string) ([]gateway.ResourceFile, error) {
	return f.files[kind], nil
}

type fakeApplier struct {
	objects    map[string]map[string]any // kind/ns/name
	namespaces map[string]bool
	status     map[string]string
	applied    int
}

func (f *fakeApplier) Apply(_ context.Context, obj map[string]any) error {
	meta := obj["metadata"].(map[string]any)
	f.objects[obj["kind"].(string)+"/"+meta["namespace"].(string)+"/"+meta["name"].(string)] = obj
	f.applied++
	return nil
}

func (f *fakeApplier) Managed(context.Context, string) ([]gateway.ManagedObject, error) {
	out := []gateway.ManagedObject{}
	for k := range f.objects {
		p := strings.SplitN(k, "/", 3)
		out = append(out, gateway.ManagedObject{Kind: p[0], Namespace: p[1], Name: p[2]})
	}
	return out, nil
}

func (f *fakeApplier) Delete(_ context.Context, o gateway.ManagedObject) error {
	delete(f.objects, o.Kind+"/"+o.Namespace+"/"+o.Name)
	return nil
}

func (f *fakeApplier) NamespaceExists(_ context.Context, ns string) (bool, error) {
	return f.namespaces[ns], nil
}

func (f *fakeApplier) PutConfigMap(_ context.Context, _ string, _, data map[string]string) error {
	f.status = data
	return nil
}

func functionYAML(t *testing.T, name, image string) string {
	t.Helper()
	y, err := service.RenderFunctionYAML(service.FunctionSpec{Name: name, Image: image, Port: 8080, InstanceType: "t1.small"}.Normalize(), service.FunctionNamespace("prod", name))
	if err != nil {
		t.Fatal(err)
	}
	return y
}

func status(t *testing.T, a *fakeApplier, key string) Status {
	t.Helper()
	var s Status
	if err := json.Unmarshal([]byte(a.status[key]), &s); err != nil {
		t.Fatalf("%s: %v", key, err)
	}
	return s
}

func TestSync(t *testing.T) {
	target := service.APITarget{HostSuffix: "-cloud.taramanji.com", InvokerNamespace: "taramanji-cloud"}
	api, _ := service.RenderAPIYAML(service.APISpec{Name: "shop", Routes: []service.APIRoute{{Path: "/", Function: "blog"}}}, target)
	src := &fakeSource{head: "aaaaaaaaaa", files: map[string][]gateway.ResourceFile{
		gateway.KindFunctions: {{Name: "blog", YAML: functionYAML(t, "blog", "ghcr.io/me/blog:v1"), Revision: "r1"}},
		gateway.KindAPIs:      {{Name: "shop", YAML: api, Revision: "r2"}},
	}}
	ap := &fakeApplier{objects: map[string]map[string]any{}, namespaces: map[string]bool{}}
	reconciled := 0
	now := time.Date(2026, 11, 11, 0, 0, 0, 0, time.UTC)
	d := New(Config{Source: src, Applier: ap, Env: "prod", Registry: "taramanji-cloud-apps", Target: target,
		Reconcile: func(context.Context) error { reconciled++; ap.namespaces["taramanji-cloud-fn-blog"] = true; return nil },
		Clock:     func() time.Time { return now }})
	ctx := context.Background()

	// 1 回目: 登録と API は共有の namespace に、Deployment・Service は関数の namespace に入る。コントローラーは間で 1 回
	if err := d.Sync(ctx); err != nil {
		t.Fatal(err)
	}
	for _, k := range []string{"ConfigMap/taramanji-cloud-apps/function-blog", "HTTPRoute/taramanji-cloud-apps/shop", "Deployment/taramanji-cloud-fn-blog/blog", "Service/taramanji-cloud-fn-blog/blog"} {
		if _, ok := ap.objects[k]; !ok {
			t.Errorf("%s が入っていない", k)
		}
	}
	labels := ap.objects["Deployment/taramanji-cloud-fn-blog/blog"]["metadata"].(map[string]any)["labels"].(map[string]any)
	if labels["cloud.taramanji.com/source"] != "functions.blog" || labels["cloud.taramanji.com/deploy-env"] != "prod" || reconciled != 1 {
		t.Fatalf("labels %v reconciled %d", labels, reconciled)
	}
	if s := status(t, ap, "functions.blog"); s.State != StateApplied || s.Revision != "r1" || s.Commit != "aaaaaaa" || len(s.History) != 1 {
		t.Fatalf("status %+v", s)
	}

	// 変わっていなければ、入れ直さない（コントローラーは回す）
	n := ap.applied
	if err := d.Sync(ctx); err != nil || ap.applied != n || reconciled != 2 {
		t.Fatalf("2 回目: %v applied %d→%d", err, n, ap.applied)
	}

	// 壊れた YAML が push されたら入れず、前の版のまま残す
	src.head = "bbbbbbbbbb"
	src.files[gateway.KindFunctions] = []gateway.ResourceFile{{Name: "blog", YAML: "kind: Secret\nmetadata:\n  name: blog\n", Revision: "r3"}}
	if err := d.Sync(ctx); err != nil {
		t.Fatal(err)
	}
	if _, ok := ap.objects["Deployment/taramanji-cloud-fn-blog/blog"]; !ok {
		t.Fatal("読めない YAML のときに、前の版を消してはいけない")
	}
	if s := status(t, ap, "functions.blog"); s.State != StateInvalid || !strings.Contains(s.Message, "前の版 r1") || len(s.History) != 2 {
		t.Fatalf("invalid: %+v", s)
	}

	// 直した版で入れ替わる
	src.head = "cccccccccc"
	src.files[gateway.KindFunctions] = []gateway.ResourceFile{{Name: "blog", YAML: functionYAML(t, "blog", "ghcr.io/me/blog:v2"), Revision: "r4"}}
	if err := d.Sync(ctx); err != nil {
		t.Fatal(err)
	}
	img := ap.objects["Deployment/taramanji-cloud-fn-blog/blog"]["spec"].(map[string]any)["template"].(map[string]any)["spec"].(map[string]any)["containers"].([]any)[0].(map[string]any)["image"]
	if img != "ghcr.io/me/blog:v2" {
		t.Fatalf("image %v", img)
	}

	// リポジトリから消えたら、クラスターからも消す
	src.head = "dddddddddd"
	src.files = map[string][]gateway.ResourceFile{}
	if err := d.Sync(ctx); err != nil {
		t.Fatal(err)
	}
	if len(ap.objects) != 0 {
		t.Fatalf("消えていない: %v", ap.objects)
	}
	if s := status(t, ap, "functions.blog"); s.State != "deleted" {
		t.Fatalf("deleted: %+v", s)
	}
}

func TestWaitsForNamespace(t *testing.T) {
	src := &fakeSource{head: "a", files: map[string][]gateway.ResourceFile{
		gateway.KindFunctions: {{Name: "blog", YAML: functionYAML(t, "blog", "ghcr.io/me/blog:v1"), Revision: "r1"}},
	}}
	ap := &fakeApplier{objects: map[string]map[string]any{}, namespaces: map[string]bool{}}
	d := New(Config{Source: src, Applier: ap, Env: "prod", Registry: "taramanji-cloud-apps", Reconcile: func(context.Context) error { return nil }})
	if err := d.Sync(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, ok := ap.objects["Deployment/taramanji-cloud-fn-blog/blog"]; ok {
		t.Fatal("namespace がないうちは入れない")
	}
	if s := status(t, ap, "functions.blog"); s.State != StateWaiting {
		t.Fatalf("waiting: %+v", s)
	}
	// namespace ができたら、リポジトリが変わっていなくても入れる
	ap.namespaces["taramanji-cloud-fn-blog"] = true
	if err := d.Sync(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, ok := ap.objects["Deployment/taramanji-cloud-fn-blog/blog"]; !ok {
		t.Fatal("namespace ができたら入れる")
	}
}
