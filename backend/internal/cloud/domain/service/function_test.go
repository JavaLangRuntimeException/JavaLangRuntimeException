package service

import (
	"errors"
	"strings"
	"testing"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
)

func validSpec() FunctionSpec {
	return FunctionSpec{Name: "blog", Image: "ghcr.io/me/blog:v1", Port: 8080, InstanceType: "t1.small",
		Env: []EnvVar{{Name: "MODE", Value: "prod: \"yes\""}}, Alerts: []string{"restarts", "cpu-high"}, Notify: []string{"discord", "mail"}}.Normalize()
}

func TestNormalizeAndValidate(t *testing.T) {
	s := validSpec()
	if s.CPUMillis != 100 || s.MemoryBytes != 128*mib || s.Custom() {
		t.Fatalf("型の値で埋める: %+v", s)
	}
	if strings.Join(s.Alerts, ",") != "cpu-high,restarts" || strings.Join(s.Notify, ",") != "mail,discord" {
		t.Fatalf("決まった順に並べる: %v %v", s.Alerts, s.Notify)
	}
	if err := s.Validate(); err != nil {
		t.Fatal(err)
	}
	bad := map[string]func(*FunctionSpec){
		"name":          func(s *FunctionSpec) { s.Name = "Blog" },
		"image":         func(s *FunctionSpec) { s.Image = "a b" },
		"port":          func(s *FunctionSpec) { s.Port = 0 },
		"instance_type": func(s *FunctionSpec) { s.InstanceType = "m5.large" },
		"cpu_millis":    func(s *FunctionSpec) { s.CPUMillis = 1001 },
		"memory":        func(s *FunctionSpec) { s.MemoryBytes = 2048 * mib },
		"env":           func(s *FunctionSpec) { s.Env = append(s.Env, EnvVar{Name: "MODE"}) },
		"alerts":        func(s *FunctionSpec) { s.Alerts = []string{"nope"} },
		"notify":        func(s *FunctionSpec) { s.Notify = []string{"slack"} },
	}
	for field, mutate := range bad {
		s := validSpec()
		mutate(&s)
		var fe *FieldError
		if err := s.Validate(); !errors.As(err, &fe) || fe.Field != field {
			t.Errorf("%s: got %v", field, err)
		}
	}
}

func TestFunctionYAMLRoundTrip(t *testing.T) {
	s := validSpec()
	s.CPUMillis, s.MemoryBytes = 300, 200*mib // 型を選んだあとに個別に変えた
	y, err := RenderFunctionYAML(s)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"kind: Deployment", "kind: Service", "priorityClassName: cloud-workload",
		"cloud.taramanji.com/kind: function", "cloud.taramanji.com/instance-type: t1.small", "cpu: 300m", "memory: 200Mi",
		"cloud.taramanji.com/alerts: cpu-high,restarts", "cloud.taramanji.com/notify: mail,discord"} {
		if !strings.Contains(y, want) {
			t.Errorf("YAML に %q がない:\n%s", want, y)
		}
	}
	// 台数は API Gateway が決める。外への公開は API（HTTPRoute）の YAML に書く
	for _, not := range []string{"replicas", "HTTPRoute", "namespace:"} {
		if strings.Contains(y, not) {
			t.Errorf("YAML に %q を書かない:\n%s", not, y)
		}
	}
	p, err := ParseFunctionYAML("blog", y)
	if err != nil {
		t.Fatal(err)
	}
	if !p.FormEditable || !p.Spec.Custom() || p.Spec.CPUMillis != 300 || p.Spec.MemoryBytes != 200*mib || p.Spec.Env[0].Value != s.Env[0].Value {
		t.Fatalf("読み戻した定義が違う: %+v", p)
	}
}

func TestParseHandWrittenFunctionYAML(t *testing.T) {
	y, _ := RenderFunctionYAML(validSpec())
	// 手で書き足した YAML は通すが、フォームでは編集できない
	p, err := ParseFunctionYAML("blog", y+"---\napiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: blog-config\ndata:\n  a: b\n")
	if err != nil || p.FormEditable {
		t.Fatalf("ConfigMap を足した YAML: %+v %v", p, err)
	}
	// ラベルのない YAML は、収まる一番小さい型にする
	p, err = ParseFunctionYAML("blog", strings.Replace(y, "    cloud.taramanji.com/instance-type: t1.small\n", "", 1))
	if err != nil || p.Spec.InstanceType != "t1.small" {
		t.Fatalf("型のラベルなし: %+v %v", p, err)
	}

	rejected := map[string]string{
		"別の namespace":      strings.Replace(y, "metadata:\n  name: blog\n", "metadata:\n  name: blog\n  namespace: taramanji\n", 1),
		"許可していない種類":         y + "---\napiVersion: v1\nkind: Secret\nmetadata:\n  name: blog\n",
		"HTTPRoute は API に": y + "---\napiVersion: gateway.networking.k8s.io/v1\nkind: HTTPRoute\nmetadata:\n  name: blog\n",
		"優先度なし":             strings.Replace(y, "priorityClassName: cloud-workload", "priorityClassName: other", 1),
		"台数の指定":             strings.Replace(y, "spec:\n  selector:", "spec:\n  replicas: 2\n  selector:", 1),
		"ほかのリソースの名前":        strings.Replace(y, "kind: Service\nmetadata:\n  name: blog\n", "kind: Service\nmetadata:\n  name: other\n", 1),
		"Deployment が 2 つ":  y + "---\napiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: blog-2\n",
		"知らない監視":            strings.Replace(y, "alerts: cpu-high,restarts", "alerts: nope", 1),
		"YAML でない":          "a: [",
	}
	for name, src := range rejected {
		if src == y {
			t.Fatalf("%s: テストの置き換えが効いていない", name)
		}
		var fe *FieldError
		if _, err := ParseFunctionYAML("blog", src); !errors.As(err, &fe) {
			t.Errorf("%s は通さない: %v", name, err)
		}
	}
}

var target = APITarget{HostSuffix: "-cloud.taramanji.com", InvokerNamespace: "cloud"}

func TestAPIYAMLRoundTrip(t *testing.T) {
	s := APISpec{Name: "shop", Routes: []APIRoute{{Path: "/", Function: "web"}, {Path: "/api/", Function: "api"}}}.Normalize()
	if s.Routes[0].Path != "/api" || s.Routes[1].Path != "/" {
		t.Fatalf("長いパスを先に: %+v", s.Routes)
	}
	if err := s.Validate(); err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(s.Functions(), ","); got != "api,web" {
		t.Fatal(got)
	}
	y, err := RenderAPIYAML(s, target)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"kind: HTTPRoute", "shop-cloud.taramanji.com", "name: X-Cloud-Function", "value: api", "name: cloud-gw", "namespace: cloud\n", "cloud.taramanji.com/kind: api"} {
		if !strings.Contains(y, want) {
			t.Errorf("YAML に %q がない:\n%s", want, y)
		}
	}
	p, err := ParseAPIYAML("shop", y, target)
	if err != nil || !p.FormEditable || len(p.Spec.Routes) != 2 || p.Spec.Routes[0] != (APIRoute{Path: "/api", Function: "api"}) {
		t.Fatalf("読み戻し: %+v %v", p, err)
	}

	rejected := map[string]string{
		"よそのホスト名":         strings.Replace(y, "shop-cloud.taramanji.com", "cloud.taramanji.com", 1),
		"ほかの Service に送る": strings.Replace(y, "name: cloud-gw", "name: cloud-api", 1),
		"ほかの namespace":   strings.Replace(y, "namespace: cloud\n", "namespace: taramanji\n", 1),
		"関数名なし":           strings.ReplaceAll(y, "X-Cloud-Function", "X-Other"),
		"ほかの Gateway":     strings.Replace(y, "namespace: cloud-gateway", "namespace: gateway", 1),
		"HTTPRoute 以外":    y + "---\napiVersion: v1\nkind: Service\nmetadata:\n  name: shop\n",
	}
	for name, src := range rejected {
		if src == y {
			t.Fatalf("%s: テストの置き換えが効いていない", name)
		}
		var fe *FieldError
		if _, err := ParseAPIYAML("shop", src, target); !errors.As(err, &fe) {
			t.Errorf("%s は通さない: %v", name, err)
		}
	}
	for name, bad := range map[string]APISpec{
		"ルートなし":  {Name: "shop"},
		"パスの重複":  {Name: "shop", Routes: []APIRoute{{Path: "/", Function: "a"}, {Path: "/", Function: "b"}}},
		"パスの形":   {Name: "shop", Routes: []APIRoute{{Path: "api", Function: "a"}}},
		"関数名なし":  {Name: "shop", Routes: []APIRoute{{Path: "/"}}},
		"名前が大文字": {Name: "Shop", Routes: []APIRoute{{Path: "/", Function: "a"}}},
	} {
		if err := bad.Normalize().Validate(); err == nil {
			t.Errorf("%s は通さない", name)
		}
	}
}

func TestQuantities(t *testing.T) {
	for q, want := range map[string]int64{"250m": 250, "1": 1000, "0.5": 500} {
		if got, err := parseCPU(q); err != nil || got != want {
			t.Errorf("cpu %s: %d %v", q, got, err)
		}
	}
	for q, want := range map[string]int64{"256Mi": 256 * mib, "1Gi": 1024 * mib, "1048576": mib} {
		if got, err := parseMemory(q); err != nil || got != want {
			t.Errorf("memory %s: %d %v", q, got, err)
		}
	}
}

func TestMonitors(t *testing.T) {
	scope := AlertScope{Environment: "prod", Cluster: "taramanji-kind", Namespace: "cloud-apps", APMEnv: "prod", InvokerService: "cloud-gw"}
	spec := validSpec()
	spec.Alerts = append(spec.Alerts, "errors")
	desired := DesiredMonitors(scope, []FunctionSpec{spec})
	if len(desired) != 3 {
		t.Fatalf("監視 3 つ分のモニター: %d", len(desired))
	}
	m := desired[0]
	if !strings.Contains(m.Query, "kube_namespace:cloud-apps,kube_deployment:blog") ||
		!strings.Contains(m.Message, "@webhook-taramanji-cloud-mail @webhook-taramanji-cloud-discord") ||
		!strings.Contains(strings.Join(m.Tags, " "), "cloud-app:blog cloud-alert:cpu-high") {
		t.Fatalf("モニター: %+v", m)
	}
	if q := desired[2].Query; !strings.Contains(q, "service:cloud-gw,resource_name:blog") {
		t.Fatalf("エラーは API Gateway の APM を見る: %s", q)
	}
	desired = desired[:2]

	// 1 つは同じ、1 つは式が古い、1 つは消した関数、1 つは重複
	same, stale := desired[0], desired[1]
	same.ID, stale.ID, stale.Query = 1, 2, "old"
	gone := gateway.Monitor{ID: 3, Tags: append(ManagedMonitorTags(scope), "cloud-app:old", "cloud-alert:restarts")}
	dup := same
	dup.ID = 4
	plan := PlanMonitors([]gateway.Monitor{same, stale, gone, dup}, desired)
	if len(plan.Create) != 0 || len(plan.Update) != 1 || plan.Update[0].ID != 2 || plan.Update[0].Query == "old" ||
		len(plan.Delete) != 2 || plan.Delete[0].ID != 3 || plan.Delete[1].ID != 4 {
		t.Fatalf("plan: %+v", plan)
	}
	if plan := PlanMonitors(nil, desired); len(plan.Create) != 2 {
		t.Fatalf("何もなければ全部作る: %+v", plan)
	}
}

func TestBucketAndDistributionYAML(t *testing.T) {
	y, err := RenderBucketYAML("site")
	if err != nil || !strings.Contains(y, "name: bucket-site") || !strings.Contains(y, "cloud.taramanji.com/bucket: site") {
		t.Fatalf("bucket: %v\n%s", err, y)
	}
	if err := ParseBucketYAML("site", y); err != nil {
		t.Fatal(err)
	}
	if err := ParseBucketYAML("site", strings.Replace(y, "bucket: site", "bucket: other", 1)); err == nil {
		t.Fatal("ほかのバケット名のラベルは通さない")
	}

	s := DistributionSpec{Name: "www", OriginType: OriginBucket, Origin: "site", CacheSeconds: 300, SPA: true}
	d, err := RenderDistributionYAML(s, target)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"www-cloud.taramanji.com", "name: X-Cloud-Bucket", "value: site", "value: \"300\"", "name: X-Cloud-Spa", "- X-Cloud-Function", "cloud.taramanji.com/kind: cdn"} {
		if !strings.Contains(d, want) {
			t.Errorf("YAML に %q がない:\n%s", want, d)
		}
	}
	p, err := ParseDistributionYAML("www", d, target)
	if err != nil || p.Spec != s {
		t.Fatalf("読み戻し: %+v %v", p, err)
	}
	// 関数が元のときは、バケットのヘッダーを消す
	fn, _ := RenderDistributionYAML(DistributionSpec{Name: "fast", OriginType: OriginFunction, Origin: "blog", CacheSeconds: 60}, target)
	if !strings.Contains(fn, "- X-Cloud-Bucket") || !strings.Contains(fn, "name: X-Cloud-Function") {
		t.Fatalf("function origin:\n%s", fn)
	}
	// 形を変えた YAML（よそのホスト名・ほかの送り先・ヘッダーを消さない）は通さない
	for name, src := range map[string]string{
		"よそのホスト名":   strings.Replace(d, "www-cloud.taramanji.com", "cloud.taramanji.com", 1),
		"ほかの送り先":    strings.Replace(d, "name: cloud-gw", "name: cloud-api", 1),
		"ヘッダーを消さない": strings.Replace(d, "- X-Cloud-Function", "- X-Other", 1),
	} {
		if _, err := ParseDistributionYAML("www", src, target); src == d || err == nil {
			t.Errorf("%s は通さない", name)
		}
	}
	for name, bad := range map[string]DistributionSpec{
		"元の種類":      {Name: "www", OriginType: "s3", Origin: "site"},
		"元なし":       {Name: "www", OriginType: OriginBucket},
		"長すぎるキャッシュ": {Name: "www", OriginType: OriginBucket, Origin: "site", CacheSeconds: MaxCacheSeconds + 1},
		"関数に SPA":   {Name: "www", OriginType: OriginFunction, Origin: "blog", SPA: true},
	} {
		if bad.Validate() == nil {
			t.Errorf("%s は通さない", name)
		}
	}
	// API の YAML は、CDN 用のヘッダーを消す
	api, _ := RenderAPIYAML(APISpec{Name: "shop", Routes: []APIRoute{{Path: "/", Function: "web"}}}, target)
	if !strings.Contains(api, "- X-Cloud-Bucket") || !strings.Contains(api, "- X-Cloud-Cache-Ttl") {
		t.Fatalf("api:\n%s", api)
	}
}
