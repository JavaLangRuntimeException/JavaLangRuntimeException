package usecase

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"testing"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/service"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/cfaccess"
)

// fakeStore はメモリの上のリポジトリ。版は保存のたびに増える
type fakeStore struct {
	files    map[string]gateway.AppFile
	messages []string
	n        int
}

func (f *fakeStore) List(context.Context) ([]gateway.AppFile, error) {
	out := []gateway.AppFile{}
	for _, v := range f.files {
		out = append(out, v)
	}
	return out, nil
}

func (f *fakeStore) Get(_ context.Context, name string) (gateway.AppFile, error) {
	v, ok := f.files[name]
	if !ok {
		return gateway.AppFile{}, gateway.ErrAppNotFound
	}
	return v, nil
}

func (f *fakeStore) Put(_ context.Context, name, yaml, revision, message string) (string, error) {
	if cur, ok := f.files[name]; (ok && cur.Revision != revision) || (!ok && revision != "") {
		return "", gateway.ErrAppConflict
	}
	f.n++
	f.files[name] = gateway.AppFile{Name: name, YAML: yaml, Revision: "r" + strconv.Itoa(f.n)}
	f.messages = append(f.messages, message)
	return f.files[name].Revision, nil
}

func (f *fakeStore) Delete(_ context.Context, name, revision, _ string) error {
	cur, ok := f.files[name]
	if !ok {
		return gateway.ErrAppNotFound
	}
	if cur.Revision != revision {
		return gateway.ErrAppConflict
	}
	delete(f.files, name)
	return nil
}

func (f *fakeStore) URL(name string) string {
	return "https://github.com/me/apps/blob/main/prod/" + name + ".yaml"
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

func newHostingUC() (*ConsoleUsecaseImpl, *fakeStore, *fakeMonitors) {
	store := &fakeStore{files: map[string]gateway.AppFile{}}
	mon := &fakeMonitors{items: map[int64]gateway.Monitor{}}
	uc := NewConsoleUsecase(Deps{Environment: "prod", HostingHostSuffix: "-hosting.taramanji.com",
		Capacity: &fakeCapacity{workloads: []gateway.Workload{{Name: "blog", Ready: 1, Desired: 2}}},
		Apps:     store, AppsRepository: "me/apps", Monitors: mon,
		AlertScope: service.AlertScope{Environment: "prod", Cluster: "taramanji-kind", Namespace: "cloud-apps", Gateway: "cloud"}})
	return uc, store, mon
}

func blogSpec() *AppSpec {
	return &AppSpec{Name: "blog", Image: "ghcr.io/me/blog:v1", Port: 8080, Replicas: 2, InstanceType: "t1.medium",
		Alerts: []string{"cpu-high", "unavailable"}, Notify: []string{"mail", "discord"}}
}

func TestHostingOptions(t *testing.T) {
	uc, _, _ := newHostingUC()
	out, err := uc.GetHostingOptions(context.Background(), GetHostingOptionsInput{})
	if err != nil {
		t.Fatal(err)
	}
	if len(out.InstanceTypes) != 4 || out.InstanceTypes[0].Name != "t1.small" || out.InstanceTypes[0].Family != "t1" ||
		len(out.AlertPresets) != len(service.AlertPresets) || !out.StoreEnabled || !out.AlertsEnabled || out.Directory != "prod" {
		t.Fatalf("options: %+v", out)
	}
	off, _ := newUC(nil).GetHostingOptions(context.Background(), GetHostingOptionsInput{})
	if off.StoreEnabled || off.AlertsEnabled {
		t.Fatal("リポジトリも Datadog もなければ使えない")
	}
	if _, err := newUC(nil).ListApps(context.Background(), ListAppsInput{}); code(err) != "store_disabled" {
		t.Fatalf("store_disabled: %v", err)
	}
}

func TestApplyGetDeleteApp(t *testing.T) {
	uc, store, mon := newHostingUC()
	ctx := cfaccess.WithEmail(context.Background(), "me@example.com")

	// フォームの定義から作る。YAML がリポジトリに入り、選んだ監視が Datadog のモニターになる
	created, err := uc.ApplyApp(ctx, ApplyAppInput{Spec: blogSpec()})
	if err != nil {
		t.Fatal(err)
	}
	app := created.App
	if app.Revision != "r1" || !app.FormEditable || app.CustomResources || app.Host != "blog-hosting.taramanji.com" ||
		!app.Deployed || app.Ready != 1 || app.Desired != 2 || app.Spec.CpuMillis != 250 || created.AlertsProblem != "" {
		t.Fatalf("app: %+v", app)
	}
	if !strings.Contains(store.messages[0], "create(prod): blog (by me@example.com)") || len(mon.items) != 2 {
		t.Fatalf("コミットとモニター: %v %d", store.messages, len(mon.items))
	}

	// 同じ名前でもう一度作ると、上書きせずに止める
	if _, err := uc.ApplyApp(ctx, ApplyAppInput{Spec: blogSpec()}); code(err) != "app_conflict" {
		t.Fatalf("app_conflict: %v", err)
	}

	// 型を選んだあとに CPU・メモリを変える。監視を 1 つ外すとモニターも消える
	spec := blogSpec()
	spec.CpuMillis, spec.Memory, spec.Alerts = 400, 300<<20, []string{"cpu-high"}
	updated, err := uc.ApplyApp(ctx, ApplyAppInput{Spec: spec, Revision: "r1"})
	if err != nil || !updated.App.CustomResources || updated.App.Spec.InstanceType != "t1.medium" || len(mon.items) != 1 {
		t.Fatalf("update: %+v %v monitors=%d", updated, err, len(mon.items))
	}

	// YAML をそのまま渡す。手で足した ConfigMap があるので、フォームでは編集できない
	y := updated.App.Yaml + "---\napiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: blog-config\n"
	byYAML, err := uc.ApplyApp(ctx, ApplyAppInput{Spec: &AppSpec{Name: "blog"}, Yaml: y, Revision: updated.App.Revision})
	if err != nil || byYAML.App.FormEditable || byYAML.App.Yaml != y {
		t.Fatalf("yaml: %+v %v", byYAML, err)
	}
	if _, err := uc.ApplyApp(ctx, ApplyAppInput{Spec: &AppSpec{Name: "blog"}, Yaml: strings.Replace(y, "ConfigMap", "Secret", 1), Revision: byYAML.App.Revision}); code(err) != "invalid_app" {
		t.Fatalf("invalid_app: %v", err)
	}

	got, err := uc.GetApp(ctx, GetAppInput{Name: "blog"})
	if err != nil || got.App.Revision != byYAML.App.Revision {
		t.Fatalf("get: %+v %v", got, err)
	}
	if _, err := uc.GetApp(ctx, GetAppInput{Name: "none"}); code(err) != "app_not_found" {
		t.Fatalf("app_not_found: %v", err)
	}

	if _, err := uc.DeleteApp(ctx, DeleteAppInput{Name: "blog", Revision: "old"}); code(err) != "app_conflict" {
		t.Fatalf("古い版では消せない: %v", err)
	}
	if _, err := uc.DeleteApp(ctx, DeleteAppInput{Name: "blog", Revision: byYAML.App.Revision}); err != nil || len(store.files) != 0 || len(mon.items) != 0 {
		t.Fatalf("delete: %v files=%d monitors=%d", err, len(store.files), len(mon.items))
	}
}

func TestListAppsKeepsBrokenYAML(t *testing.T) {
	uc, store, mon := newHostingUC()
	ctx := context.Background()
	if _, err := uc.ApplyApp(ctx, ApplyAppInput{Spec: blogSpec()}); err != nil {
		t.Fatal(err)
	}
	// git に直接 push された、読めない YAML
	store.files["broken"] = gateway.AppFile{Name: "broken", YAML: "kind: Secret\nmetadata:\n  name: broken\n", Revision: "x"}
	out, err := uc.ListApps(ctx, ListAppsInput{})
	if err != nil || len(out.Apps) != 2 || out.Apps[1].Spec.Name != "broken" || out.Apps[1].Problem == "" || out.Apps[0].Problem != "" {
		t.Fatalf("list: %+v %v", out, err)
	}
	// 読めない YAML があるあいだは、ほかのアプリのモニターを消さない
	if _, err := uc.SyncAlerts(ctx, SyncAlertsInput{}); code(err) != "alerts_failed" || len(mon.items) != 2 {
		t.Fatalf("alerts_failed: %v monitors=%d", err, len(mon.items))
	}
	delete(store.files, "broken")
	mon.err = errors.New("datadog down")
	if out, err := uc.ApplyApp(ctx, ApplyAppInput{Spec: blogSpec(), Revision: "r1"}); err != nil || out.AlertsProblem == "" {
		t.Fatalf("Datadog が落ちていても YAML は保存する: %+v %v", out, err)
	}
}

func TestPreviewApp(t *testing.T) {
	uc, store, _ := newHostingUC()
	out, err := uc.PreviewApp(context.Background(), PreviewAppInput{Spec: blogSpec()})
	if err != nil || !strings.Contains(out.Yaml, "kind: Deployment") || len(store.files) != 0 {
		t.Fatalf("preview: %v", err)
	}
	bad := blogSpec()
	bad.InstanceType = "m5.large"
	if _, err := uc.PreviewApp(context.Background(), PreviewAppInput{Spec: bad}); code(err) != "invalid_app" {
		t.Fatalf("invalid_app: %v", err)
	}
}
