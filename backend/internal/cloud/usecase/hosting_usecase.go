package usecase

import (
	"context"
	"errors"
	"fmt"
	"sort"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/service"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/cfaccess"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/errs"
)

func (u *ConsoleUsecaseImpl) GetHostingOptions(_ context.Context, _ GetHostingOptionsInput) (*GetHostingOptionsOutput, error) {
	out := &GetHostingOptionsOutput{
		InstanceTypes: []*InstanceType{}, AlertPresets: []*AlertPreset{}, NotifyChannels: service.NotifyChannels,
		MinCpuMillis: service.MinCPUMillis, MaxCpuMillis: service.MaxCPUMillis,
		MinMemory: service.MinMemoryBytes, MaxMemory: service.MaxMemoryBytes, MaxReplicas: service.MaxReplicas,
		StoreEnabled: u.d.Apps != nil, AlertsEnabled: u.d.Monitors != nil,
		Repository: u.d.AppsRepository, Directory: u.d.Environment,
	}
	for _, t := range service.InstanceTypes {
		out.InstanceTypes = append(out.InstanceTypes, &InstanceType{Name: t.Name, Family: service.InstanceFamily(t.Name), Memory: t.MemoryBytes, CpuMillis: t.CPUMillis})
	}
	for _, p := range service.AlertPresets {
		out.AlertPresets = append(out.AlertPresets, &AlertPreset{ID: p.ID, Label: p.Label, Description: p.Description})
	}
	return out, nil
}

func (u *ConsoleUsecaseImpl) store() (gateway.AppStore, error) {
	if u.d.Apps == nil {
		return nil, errs.New(errs.ErrorTypeBadRequest, "アプリ用のリポジトリがつながっていません").WithCode("store_disabled")
	}
	return u.d.Apps, nil
}

// storeErr は置き場のエラーを、画面で区別できるコードにする
func storeErr(err error) error {
	switch {
	case errors.Is(err, gateway.ErrAppNotFound):
		return errs.New(errs.ErrorTypeNotFound, "アプリが見つかりません").WithCode("app_not_found")
	case errors.Is(err, gateway.ErrAppConflict):
		return errs.New(errs.ErrorTypeDuplicate, "ほかの場所で変更されています。読み直してからやり直してください").WithCode("app_conflict")
	}
	return errs.New(errs.ErrorTypeUpstream, "アプリ用のリポジトリ（GitHub）とやり取りできませんでした").WithCode("store_failed").WithCause(err)
}

func invalid(err error) error {
	var fe *service.FieldError
	if errors.As(err, &fe) {
		return errs.NewValidationError(fe.Field, fe.Message).WithCode("invalid_app")
	}
	return errs.NewInternalError(err)
}

func specOf(s *AppSpec) service.AppSpec {
	if s == nil {
		return service.AppSpec{}
	}
	out := service.AppSpec{Name: s.Name, Image: s.Image, Port: s.Port, Replicas: s.Replicas, InstanceType: s.InstanceType,
		CPUMillis: s.CpuMillis, MemoryBytes: s.Memory, Alerts: s.Alerts, Notify: s.Notify}
	for _, e := range s.Env {
		if e != nil {
			out.Env = append(out.Env, service.EnvVar{Name: e.Name, Value: e.Value})
		}
	}
	return out.Normalize()
}

func specOut(s service.AppSpec) *AppSpec {
	out := &AppSpec{Name: s.Name, Image: s.Image, Port: s.Port, Replicas: s.Replicas, InstanceType: s.InstanceType,
		CpuMillis: s.CPUMillis, Memory: s.MemoryBytes, Env: []*EnvVar{}, Alerts: s.Alerts, Notify: s.Notify}
	for _, e := range s.Env {
		out.Env = append(out.Env, &EnvVar{Name: e.Name, Value: e.Value})
	}
	return out
}

// appOf はリポジトリの YAML と、クラスターの状態（なければ nil）からアプリを作る。
// 手で push した YAML が読めないときも一覧から消さず、problem に理由を入れる
func (u *ConsoleUsecaseImpl) appOf(f gateway.AppFile, w *gateway.Workload) *App {
	app := &App{Spec: &AppSpec{Name: f.Name, Env: []*EnvVar{}, Alerts: []string{}, Notify: []string{}}, Yaml: f.YAML, Revision: f.Revision,
		Host: service.HostOf(f.Name, u.d.HostingHostSuffix), SourceURL: u.d.Apps.URL(f.Name)}
	if w != nil {
		app.Deployed, app.Ready, app.Desired = true, w.Ready, w.Desired
	}
	parsed, err := service.ParseYAML(f.Name, f.YAML, u.d.HostingHostSuffix)
	if err != nil {
		app.Problem = err.Error()
		return app
	}
	app.Spec = specOut(parsed.Spec)
	app.FormEditable = parsed.FormEditable
	app.CustomResources = parsed.Spec.Custom()
	return app
}

func (u *ConsoleUsecaseImpl) workloads(ctx context.Context) map[string]*gateway.Workload {
	out := map[string]*gateway.Workload{}
	ws, err := u.d.Capacity.AppWorkloads(ctx)
	if err != nil {
		// 状態が読めなくても、定義（YAML）の一覧と編集は止めない
		return out
	}
	for i := range ws {
		out[ws[i].Name] = &ws[i]
	}
	return out
}

func (u *ConsoleUsecaseImpl) ListApps(ctx context.Context, _ ListAppsInput) (*ListAppsOutput, error) {
	store, err := u.store()
	if err != nil {
		return nil, err
	}
	files, err := store.List(ctx)
	if err != nil {
		return nil, storeErr(err)
	}
	ws := u.workloads(ctx)
	out := &ListAppsOutput{Apps: []*App{}}
	for _, f := range files {
		out.Apps = append(out.Apps, u.appOf(f, ws[f.Name]))
	}
	sort.Slice(out.Apps, func(i, j int) bool { return out.Apps[i].Spec.Name < out.Apps[j].Spec.Name })
	return out, nil
}

func (u *ConsoleUsecaseImpl) GetApp(ctx context.Context, in GetAppInput) (*GetAppOutput, error) {
	store, err := u.store()
	if err != nil {
		return nil, err
	}
	if !service.ValidAppName(in.Name) {
		return nil, storeErr(gateway.ErrAppNotFound)
	}
	f, err := store.Get(ctx, in.Name)
	if err != nil {
		return nil, storeErr(err)
	}
	return &GetAppOutput{App: u.appOf(f, u.workloads(ctx)[f.Name])}, nil
}

func (u *ConsoleUsecaseImpl) PreviewApp(_ context.Context, in PreviewAppInput) (*PreviewAppOutput, error) {
	spec := specOf(in.Spec)
	if err := spec.Validate(); err != nil {
		return nil, invalid(err)
	}
	y, err := service.RenderYAML(spec, u.d.HostingHostSuffix)
	if err != nil {
		return nil, errs.NewInternalError(err)
	}
	return &PreviewAppOutput{Yaml: y}, nil
}

func (u *ConsoleUsecaseImpl) ApplyApp(ctx context.Context, in ApplyAppInput) (*ApplyAppOutput, error) {
	store, err := u.store()
	if err != nil {
		return nil, err
	}
	if in.Spec == nil || !service.ValidAppName(in.Spec.Name) {
		return nil, invalid(service.AppSpec{}.Validate())
	}
	name, y := in.Spec.Name, in.Yaml
	if y == "" {
		spec := specOf(in.Spec)
		if err := spec.Validate(); err != nil {
			return nil, invalid(err)
		}
		if y, err = service.RenderYAML(spec, u.d.HostingHostSuffix); err != nil {
			return nil, errs.NewInternalError(err)
		}
	} else if _, err := service.ParseYAML(name, y, u.d.HostingHostSuffix); err != nil {
		return nil, invalid(err)
	}
	verb := "create"
	if in.Revision != "" {
		verb = "update"
	}
	rev, err := store.Put(ctx, name, y, in.Revision, fmt.Sprintf("%s(%s): %s (by %s)", verb, u.d.Environment, name, cfaccess.EmailFrom(ctx)))
	if err != nil {
		return nil, storeErr(err)
	}
	out := &ApplyAppOutput{App: u.appOf(gateway.AppFile{Name: name, YAML: y, Revision: rev}, u.workloads(ctx)[name])}
	// YAML は保存できた。監視の反映に失敗しても戻さず、理由だけ返す（「監視を同期」でやり直せる）
	if _, err := u.syncAlerts(ctx); err != nil {
		out.AlertsProblem = err.Error()
	}
	return out, nil
}

func (u *ConsoleUsecaseImpl) DeleteApp(ctx context.Context, in DeleteAppInput) (*DeleteAppOutput, error) {
	store, err := u.store()
	if err != nil {
		return nil, err
	}
	if !service.ValidAppName(in.Name) {
		return nil, storeErr(gateway.ErrAppNotFound)
	}
	if err := store.Delete(ctx, in.Name, in.Revision, fmt.Sprintf("delete(%s): %s (by %s)", u.d.Environment, in.Name, cfaccess.EmailFrom(ctx))); err != nil {
		return nil, storeErr(err)
	}
	out := &DeleteAppOutput{}
	if _, err := u.syncAlerts(ctx); err != nil {
		out.AlertsProblem = err.Error()
	}
	return out, nil
}

func (u *ConsoleUsecaseImpl) SyncAlerts(ctx context.Context, _ SyncAlertsInput) (*SyncAlertsOutput, error) {
	if u.d.Monitors == nil {
		return nil, errs.New(errs.ErrorTypeBadRequest, "この環境では監視を Datadog に作れません（本番だけ）").WithCode("alerts_disabled")
	}
	if _, err := u.store(); err != nil {
		return nil, err
	}
	plan, err := u.syncAlerts(ctx)
	if err != nil {
		return nil, errs.New(errs.ErrorTypeUpstream, "監視を Datadog に反映できませんでした").WithCode("alerts_failed").WithCause(err)
	}
	return &SyncAlertsOutput{Created: int32(len(plan.Create)), Updated: int32(len(plan.Update)), Deleted: int32(len(plan.Delete))}, nil
}

// syncAlerts はリポジトリの全アプリの YAML から、この環境の Datadog のモニターをそろえる。
// Datadog がない環境（stg / dev）では何もしない
func (u *ConsoleUsecaseImpl) syncAlerts(ctx context.Context) (service.MonitorPlan, error) {
	var plan service.MonitorPlan
	if u.d.Monitors == nil || u.d.Apps == nil {
		return plan, nil
	}
	files, err := u.d.Apps.List(ctx)
	if err != nil {
		return plan, err
	}
	specs := []service.AppSpec{}
	for _, f := range files {
		parsed, err := service.ParseYAML(f.Name, f.YAML, u.d.HostingHostSuffix)
		if err != nil {
			// 読めない YAML が 1 つあるだけで、ほかのアプリのモニターを消してしまわないよう、全体を止める
			return plan, fmt.Errorf("%s の YAML を読めません: %w", f.Name, err)
		}
		specs = append(specs, parsed.Spec)
	}
	existing, err := u.d.Monitors.List(ctx, service.ManagedMonitorTags(u.d.AlertScope))
	if err != nil {
		return plan, err
	}
	plan = service.PlanMonitors(existing, service.DesiredMonitors(u.d.AlertScope, specs))
	for _, m := range plan.Create {
		if err := u.d.Monitors.Create(ctx, m); err != nil {
			return plan, err
		}
	}
	for _, m := range plan.Update {
		if err := u.d.Monitors.Update(ctx, m); err != nil {
			return plan, err
		}
	}
	for _, m := range plan.Delete {
		if err := u.d.Monitors.Delete(ctx, m.ID); err != nil {
			return plan, err
		}
	}
	return plan, nil
}
