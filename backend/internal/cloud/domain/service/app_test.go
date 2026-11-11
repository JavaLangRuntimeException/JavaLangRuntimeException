package service

import (
	"errors"
	"strings"
	"testing"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
)

const suffix = "-hosting.taramanji.com"

func validSpec() AppSpec {
	return AppSpec{Name: "blog", Image: "ghcr.io/me/blog:v1", Port: 8080, Replicas: 1, InstanceType: "t1.small",
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
	bad := map[string]func(*AppSpec){
		"name":          func(s *AppSpec) { s.Name = "Blog" },
		"image":         func(s *AppSpec) { s.Image = "a b" },
		"port":          func(s *AppSpec) { s.Port = 0 },
		"replicas":      func(s *AppSpec) { s.Replicas = 4 },
		"instance_type": func(s *AppSpec) { s.InstanceType = "m5.large" },
		"cpu_millis":    func(s *AppSpec) { s.CPUMillis = 1001 },
		"memory":        func(s *AppSpec) { s.MemoryBytes = 2048 * mib },
		"env":           func(s *AppSpec) { s.Env = append(s.Env, EnvVar{Name: "MODE"}) },
		"alerts":        func(s *AppSpec) { s.Alerts = []string{"nope"} },
		"notify":        func(s *AppSpec) { s.Notify = []string{"slack"} },
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

func TestRenderAndParseRoundTrip(t *testing.T) {
	s := validSpec()
	s.CPUMillis, s.MemoryBytes = 300, 200*mib // 型を選んだあとに個別に変えた
	y, err := RenderYAML(s, suffix)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"kind: Deployment", "kind: Service", "kind: HTTPRoute", "priorityClassName: cloud-workload",
		"cloud.taramanji.com/instance-type: t1.small", "cpu: 300m", "memory: 200Mi", "blog-hosting.taramanji.com",
		"cloud.taramanji.com/alerts: cpu-high,restarts", "cloud.taramanji.com/notify: mail,discord"} {
		if !strings.Contains(y, want) {
			t.Errorf("YAML に %q がない:\n%s", want, y)
		}
	}
	if strings.Contains(y, "namespace: cloud-apps") {
		t.Error("namespace は書かない")
	}
	p, err := ParseYAML("blog", y, suffix)
	if err != nil {
		t.Fatal(err)
	}
	if !p.FormEditable || !p.Spec.Custom() || p.Spec.CPUMillis != 300 || p.Spec.MemoryBytes != 200*mib || p.Spec.Env[0].Value != s.Env[0].Value {
		t.Fatalf("読み戻した定義が違う: %+v", p)
	}
}

func TestParseHandWrittenYAML(t *testing.T) {
	y, _ := RenderYAML(validSpec(), suffix)
	// 手で書き足した YAML は通すが、フォームでは編集できない
	extra := y + "---\napiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: blog-config\ndata:\n  a: b\n"
	p, err := ParseYAML("blog", extra, suffix)
	if err != nil || p.FormEditable {
		t.Fatalf("ConfigMap を足した YAML: %+v %v", p, err)
	}
	// ラベルのない YAML は、収まる一番小さい型にする
	p, err = ParseYAML("blog", strings.Replace(y, "    cloud.taramanji.com/instance-type: t1.small\n", "", 1), suffix)
	if err != nil || p.Spec.InstanceType != "t1.small" {
		t.Fatalf("型のラベルなし: %+v %v", p, err)
	}

	rejected := map[string]string{
		"別の namespace":     strings.Replace(y, "metadata:\n  name: blog\n", "metadata:\n  name: blog\n  namespace: taramanji\n", 1),
		"許可していない種類":        y + "---\napiVersion: v1\nkind: Secret\nmetadata:\n  name: blog\n",
		"よそのホスト名":          strings.Replace(y, "blog-hosting.taramanji.com", "cloud.taramanji.com", 1),
		"優先度なし":            strings.Replace(y, "priorityClassName: cloud-workload", "priorityClassName: other", 1),
		"ほかのアプリの名前":        strings.Replace(y, "kind: Service\nmetadata:\n  name: blog\n", "kind: Service\nmetadata:\n  name: other\n", 1),
		"Deployment が 2 つ": y + "---\napiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: blog-2\n",
		"知らない監視":           strings.Replace(y, "alerts: cpu-high,restarts", "alerts: nope", 1),
		"YAML でない":         "a: [",
	}
	for name, src := range rejected {
		if src == y {
			t.Fatalf("%s: テストの置き換えが効いていない", name)
		}
		var fe *FieldError
		if _, err := ParseYAML("blog", src, suffix); !errors.As(err, &fe) {
			t.Errorf("%s は通さない: %v", name, err)
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
	scope := AlertScope{Environment: "prod", Cluster: "taramanji-kind", Namespace: "cloud-apps", Gateway: "cloud"}
	desired := DesiredMonitors(scope, []AppSpec{validSpec()})
	if len(desired) != 2 {
		t.Fatalf("監視 2 つ分のモニター: %d", len(desired))
	}
	m := desired[0]
	if !strings.Contains(m.Query, "kube_namespace:cloud-apps,kube_deployment:blog") ||
		!strings.Contains(m.Message, "@webhook-taramanji-cloud-mail @webhook-taramanji-cloud-discord") ||
		!strings.Contains(strings.Join(m.Tags, " "), "cloud-app:blog cloud-alert:cpu-high") {
		t.Fatalf("モニター: %+v", m)
	}

	// 1 つは同じ、1 つは式が古い、1 つは消したアプリ、1 つは重複
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
