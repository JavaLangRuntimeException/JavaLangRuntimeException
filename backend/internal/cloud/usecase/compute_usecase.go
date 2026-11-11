package usecase

import (
	"context"
	"errors"
	"fmt"
	"slices"
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
		MinMemory: service.MinMemoryBytes, MaxMemory: service.MaxMemoryBytes,
		StoreEnabled: u.d.Apps != nil, AlertsEnabled: u.d.Monitors != nil,
		Repository: u.d.AppsRepository, Directory: u.d.Environment,
		IdleTimeoutSeconds: int32(u.d.IdleTimeout.Seconds()), HostSuffix: u.d.APITarget.HostSuffix,
		StorageEnabled: u.d.Objects != nil, DnsEnabled: u.d.DNS != nil,
	}
	for _, t := range service.InstanceTypes {
		out.InstanceTypes = append(out.InstanceTypes, &InstanceType{Name: t.Name, Family: service.InstanceFamily(t.Name), Memory: t.MemoryBytes, CpuMillis: t.CPUMillis})
	}
	for _, p := range service.AlertPresets {
		out.AlertPresets = append(out.AlertPresets, &AlertPreset{ID: p.ID, Label: p.Label, Description: p.Description})
	}
	return out, nil
}

func (u *ConsoleUsecaseImpl) store() (gateway.ResourceStore, error) {
	if u.d.Apps == nil {
		return nil, errs.New(errs.ErrorTypeBadRequest, "リソースの YAML を置くリポジトリがつながっていません").WithCode("store_disabled")
	}
	return u.d.Apps, nil
}

// storeErr は置き場のエラーを、画面で区別できるコードにする
func storeErr(err error) error {
	switch {
	case errors.Is(err, gateway.ErrResourceNotFound):
		return errs.New(errs.ErrorTypeNotFound, "見つかりません").WithCode("not_found")
	case errors.Is(err, gateway.ErrResourceConflict):
		return errs.New(errs.ErrorTypeDuplicate, "同じ名前のものが既にあるか、ほかの場所で変更されています。読み直してからやり直してください").WithCode("conflict")
	}
	return errs.New(errs.ErrorTypeUpstream, "リポジトリ（GitHub）とやり取りできませんでした").WithCode("store_failed").WithCause(err)
}

func invalid(err error) error {
	var fe *service.FieldError
	if errors.As(err, &fe) {
		return errs.NewValidationError(fe.Field, fe.Message).WithCode("invalid")
	}
	return errs.NewInternalError(err)
}

// commitMessage はリポジトリに残すコミットの件名（誰が何をしたか）
func (u *ConsoleUsecaseImpl) commitMessage(ctx context.Context, verb, kind, name string) string {
	return fmt.Sprintf("%s(%s): %s %s (by %s)", verb, u.d.Environment, kind, name, cfaccess.EmailFrom(ctx))
}

func verbOf(revision string) string {
	if revision == "" {
		return "create"
	}
	return "update"
}

// ---- 関数 ----

func functionSpecOf(s *FunctionSpec) service.FunctionSpec {
	if s == nil {
		return service.FunctionSpec{}
	}
	out := service.FunctionSpec{Name: s.Name, Image: s.Image, Port: s.Port, InstanceType: s.InstanceType,
		CPUMillis: s.CpuMillis, MemoryBytes: s.Memory, Alerts: s.Alerts, Notify: s.Notify}
	for _, e := range s.Env {
		if e != nil {
			out.Env = append(out.Env, service.EnvVar{Name: e.Name, Value: e.Value})
		}
	}
	return out.Normalize()
}

func functionSpecOut(s service.FunctionSpec) *FunctionSpec {
	out := &FunctionSpec{Name: s.Name, Image: s.Image, Port: s.Port, InstanceType: s.InstanceType,
		CpuMillis: s.CPUMillis, Memory: s.MemoryBytes, Env: []*EnvVar{}, Alerts: s.Alerts, Notify: s.Notify}
	for _, e := range s.Env {
		out.Env = append(out.Env, &EnvVar{Name: e.Name, Value: e.Value})
	}
	return out
}

// functionOf はリポジトリの YAML と、クラスターの状態（なければ nil）から関数を作る。
// 手で push した YAML が読めないときも一覧から消さず、problem に理由を入れる
func (u *ConsoleUsecaseImpl) functionOf(f gateway.ResourceFile, w *gateway.Workload, apis []string) *Function {
	fn := &Function{Spec: &FunctionSpec{Name: f.Name, Env: []*EnvVar{}, Alerts: []string{}, Notify: []string{}}, Apis: apis,
		Source: &Source{Yaml: f.YAML, Revision: f.Revision, URL: u.d.Apps.URL(gateway.KindFunctions, f.Name)}}
	if fn.Apis == nil {
		fn.Apis = []string{}
	}
	if w != nil {
		fn.Deployed, fn.Ready, fn.Desired = true, w.Ready, w.Desired
	}
	parsed, err := service.ParseFunctionYAML(f.Name, f.YAML)
	if err != nil {
		fn.Source.Problem = err.Error()
		return fn
	}
	fn.Spec = functionSpecOut(parsed.Spec)
	fn.Source.FormEditable = parsed.FormEditable
	fn.CustomResources = parsed.Spec.Custom()
	return fn
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

// apiSpecs はリポジトリの API のうち、読めるものの定義
func (u *ConsoleUsecaseImpl) apiSpecs(ctx context.Context) ([]service.APISpec, error) {
	files, err := u.d.Apps.List(ctx, gateway.KindAPIs)
	if err != nil {
		return nil, err
	}
	out := []service.APISpec{}
	for _, f := range files {
		if parsed, err := service.ParseAPIYAML(f.Name, f.YAML, u.d.APITarget); err == nil {
			out = append(out, parsed.Spec)
		}
	}
	return out, nil
}

// apisOf は関数名 → その関数に渡している API の名前
func apisOf(apis []service.APISpec) map[string][]string {
	out := map[string][]string{}
	for _, a := range apis {
		for _, fn := range a.Functions() {
			out[fn] = append(out[fn], a.Name)
		}
	}
	for _, names := range out {
		sort.Strings(names)
	}
	return out
}

func (u *ConsoleUsecaseImpl) ListFunctions(ctx context.Context, _ ListFunctionsInput) (*ListFunctionsOutput, error) {
	store, err := u.store()
	if err != nil {
		return nil, err
	}
	files, err := store.List(ctx, gateway.KindFunctions)
	if err != nil {
		return nil, storeErr(err)
	}
	apis, err := u.apiSpecs(ctx)
	if err != nil {
		return nil, storeErr(err)
	}
	ws, used := u.workloads(ctx), apisOf(apis)
	out := &ListFunctionsOutput{Functions: []*Function{}}
	for _, f := range files {
		out.Functions = append(out.Functions, u.functionOf(f, ws[f.Name], used[f.Name]))
	}
	sort.Slice(out.Functions, func(i, j int) bool { return out.Functions[i].Spec.Name < out.Functions[j].Spec.Name })
	return out, nil
}

func (u *ConsoleUsecaseImpl) PreviewFunction(_ context.Context, in PreviewFunctionInput) (*PreviewFunctionOutput, error) {
	spec := functionSpecOf(in.Spec)
	if err := spec.Validate(); err != nil {
		return nil, invalid(err)
	}
	y, err := service.RenderFunctionYAML(spec)
	if err != nil {
		return nil, errs.NewInternalError(err)
	}
	return &PreviewFunctionOutput{Yaml: y}, nil
}

func (u *ConsoleUsecaseImpl) ApplyFunction(ctx context.Context, in ApplyFunctionInput) (*ApplyFunctionOutput, error) {
	store, err := u.store()
	if err != nil {
		return nil, err
	}
	if in.Spec == nil || !service.ValidName(in.Spec.Name) {
		return nil, invalid(service.FunctionSpec{}.Validate())
	}
	name, y := in.Spec.Name, in.Yaml
	if y == "" {
		spec := functionSpecOf(in.Spec)
		if err := spec.Validate(); err != nil {
			return nil, invalid(err)
		}
		if y, err = service.RenderFunctionYAML(spec); err != nil {
			return nil, errs.NewInternalError(err)
		}
	} else if _, err := service.ParseFunctionYAML(name, y); err != nil {
		return nil, invalid(err)
	}
	rev, err := store.Put(ctx, gateway.KindFunctions, name, y, in.Revision, u.commitMessage(ctx, verbOf(in.Revision), "function", name))
	if err != nil {
		return nil, storeErr(err)
	}
	out := &ApplyFunctionOutput{Function: u.functionOf(gateway.ResourceFile{Name: name, YAML: y, Revision: rev}, u.workloads(ctx)[name], nil)}
	// YAML は保存できた。監視の反映に失敗しても戻さず、理由だけ返す（「監視を同期」でやり直せる）
	if _, err := u.syncAlerts(ctx); err != nil {
		out.AlertsProblem = err.Error()
	}
	return out, nil
}

func (u *ConsoleUsecaseImpl) DeleteFunction(ctx context.Context, in DeleteFunctionInput) (*DeleteFunctionOutput, error) {
	store, err := u.store()
	if err != nil {
		return nil, err
	}
	if !service.ValidName(in.Name) {
		return nil, storeErr(gateway.ErrResourceNotFound)
	}
	// API が渡している関数は消させない（消すと、その API が 404 を返し続ける）
	apis, err := u.apiSpecs(ctx)
	if err != nil {
		return nil, storeErr(err)
	}
	if used := apisOf(apis)[in.Name]; len(used) > 0 {
		return nil, errs.New(errs.ErrorTypeBadRequest, fmt.Sprintf("API %v がこの関数に渡しています。先に API のルートを変えるか、API を消してください", used)).WithCode("function_in_use")
	}
	dists, err := u.distributionSpecs(ctx)
	if err != nil {
		return nil, storeErr(err)
	}
	if used := originsOf(dists, service.OriginFunction)[in.Name]; len(used) > 0 {
		return nil, errs.New(errs.ErrorTypeBadRequest, fmt.Sprintf("CDN %v がこの関数を元にしています。先に CDN を消してください", used)).WithCode("function_in_use")
	}
	if err := store.Delete(ctx, gateway.KindFunctions, in.Name, in.Revision, u.commitMessage(ctx, "delete", "function", in.Name)); err != nil {
		return nil, storeErr(err)
	}
	out := &DeleteFunctionOutput{}
	if _, err := u.syncAlerts(ctx); err != nil {
		out.AlertsProblem = err.Error()
	}
	return out, nil
}

// ---- API ----

func apiSpecOf(s *ApiSpec) service.APISpec {
	if s == nil {
		return service.APISpec{}
	}
	out := service.APISpec{Name: s.Name}
	for _, r := range s.Routes {
		if r != nil {
			out.Routes = append(out.Routes, service.APIRoute{Path: r.Path, Function: r.Function})
		}
	}
	return out.Normalize()
}

func (u *ConsoleUsecaseImpl) apiOf(f gateway.ResourceFile) *Api {
	api := &Api{Spec: &ApiSpec{Name: f.Name, Routes: []*ApiRoute{}}, Host: service.HostOf(f.Name, u.d.APITarget.HostSuffix),
		Source: &Source{Yaml: f.YAML, Revision: f.Revision, URL: u.d.Apps.URL(gateway.KindAPIs, f.Name)}}
	parsed, err := service.ParseAPIYAML(f.Name, f.YAML, u.d.APITarget)
	if err != nil {
		api.Source.Problem = err.Error()
		return api
	}
	for _, r := range parsed.Spec.Routes {
		api.Spec.Routes = append(api.Spec.Routes, &ApiRoute{Path: r.Path, Function: r.Function})
	}
	api.Source.FormEditable = parsed.FormEditable
	return api
}

func (u *ConsoleUsecaseImpl) ListApis(ctx context.Context, _ ListApisInput) (*ListApisOutput, error) {
	store, err := u.store()
	if err != nil {
		return nil, err
	}
	files, err := store.List(ctx, gateway.KindAPIs)
	if err != nil {
		return nil, storeErr(err)
	}
	out := &ListApisOutput{Apis: []*Api{}}
	for _, f := range files {
		out.Apis = append(out.Apis, u.apiOf(f))
	}
	sort.Slice(out.Apis, func(i, j int) bool { return out.Apis[i].Spec.Name < out.Apis[j].Spec.Name })
	return out, nil
}

func (u *ConsoleUsecaseImpl) PreviewApi(_ context.Context, in PreviewApiInput) (*PreviewApiOutput, error) {
	spec := apiSpecOf(in.Spec)
	if err := spec.Validate(); err != nil {
		return nil, invalid(err)
	}
	y, err := service.RenderAPIYAML(spec, u.d.APITarget)
	if err != nil {
		return nil, errs.NewInternalError(err)
	}
	return &PreviewApiOutput{Yaml: y}, nil
}

func (u *ConsoleUsecaseImpl) ApplyApi(ctx context.Context, in ApplyApiInput) (*ApplyApiOutput, error) {
	store, err := u.store()
	if err != nil {
		return nil, err
	}
	if in.Spec == nil || !service.ValidName(in.Spec.Name) {
		return nil, invalid(service.APISpec{}.Validate())
	}
	name, y := in.Spec.Name, in.Yaml
	var spec service.APISpec
	if y == "" {
		spec = apiSpecOf(in.Spec)
		if err := spec.Validate(); err != nil {
			return nil, invalid(err)
		}
		if y, err = service.RenderAPIYAML(spec, u.d.APITarget); err != nil {
			return nil, errs.NewInternalError(err)
		}
	} else {
		parsed, err := service.ParseAPIYAML(name, y, u.d.APITarget)
		if err != nil {
			return nil, invalid(err)
		}
		spec = parsed.Spec
	}
	// ない関数には渡せない（保存できてしまうと、その API は 404 を返し続ける）
	functions, err := store.List(ctx, gateway.KindFunctions)
	if err != nil {
		return nil, storeErr(err)
	}
	for _, fn := range spec.Functions() {
		if !slices.ContainsFunc(functions, func(f gateway.ResourceFile) bool { return f.Name == fn }) {
			return nil, errs.NewValidationError("routes", fmt.Sprintf("関数 %q がありません", fn)).WithCode("invalid")
		}
	}
	if err := u.hostFree(ctx, gateway.KindCDN, name, in.Revision); err != nil {
		return nil, err
	}
	rev, err := store.Put(ctx, gateway.KindAPIs, name, y, in.Revision, u.commitMessage(ctx, verbOf(in.Revision), "api", name))
	if err != nil {
		return nil, storeErr(err)
	}
	return &ApplyApiOutput{API: u.apiOf(gateway.ResourceFile{Name: name, YAML: y, Revision: rev}), DnsProblem: u.ensureDNS(ctx, name)}, nil
}

func (u *ConsoleUsecaseImpl) DeleteApi(ctx context.Context, in DeleteApiInput) (*DeleteApiOutput, error) {
	store, err := u.store()
	if err != nil {
		return nil, err
	}
	if !service.ValidName(in.Name) {
		return nil, storeErr(gateway.ErrResourceNotFound)
	}
	if err := store.Delete(ctx, gateway.KindAPIs, in.Name, in.Revision, u.commitMessage(ctx, "delete", "api", in.Name)); err != nil {
		return nil, storeErr(err)
	}
	return &DeleteApiOutput{DnsProblem: u.removeDNS(ctx, in.Name)}, nil
}

// ---- ホスト名（API と CDN で共通。<名前> + 接尾辞）----

// hostFree は新しく作るとき、もう一方の種類（API なら CDN、CDN なら API）が同じ名前＝同じホスト名を使っていないか確かめる。
// 同じ種類どうしはファイル名が同じになるので、置き場が弾く
func (u *ConsoleUsecaseImpl) hostFree(ctx context.Context, otherKind, name, revision string) error {
	if revision != "" {
		return nil
	}
	_, err := u.d.Apps.Get(ctx, otherKind, name)
	if errors.Is(err, gateway.ErrResourceNotFound) {
		return nil
	}
	if err != nil {
		return storeErr(err)
	}
	return errs.New(errs.ErrorTypeDuplicate, fmt.Sprintf("%s は既に使われています", service.HostOf(name, u.d.APITarget.HostSuffix))).WithCode("host_taken")
}

// ensureDNS はホスト名の DNS を登録する。失敗しても YAML の保存は戻さず、理由を返す（空なら問題なし）
func (u *ConsoleUsecaseImpl) ensureDNS(ctx context.Context, name string) string {
	if u.d.DNS == nil {
		return ""
	}
	if err := u.d.DNS.Ensure(ctx, service.HostOf(name, u.d.APITarget.HostSuffix)); err != nil {
		return err.Error()
	}
	return ""
}

func (u *ConsoleUsecaseImpl) removeDNS(ctx context.Context, name string) string {
	if u.d.DNS == nil {
		return ""
	}
	if err := u.d.DNS.Remove(ctx, service.HostOf(name, u.d.APITarget.HostSuffix)); err != nil {
		return err.Error()
	}
	return ""
}

// ---- 監視 ----

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

// syncAlerts はリポジトリの全関数の YAML から、この環境の Datadog のモニターをそろえる。
// Datadog がない環境（stg / dev）では何もしない
func (u *ConsoleUsecaseImpl) syncAlerts(ctx context.Context) (service.MonitorPlan, error) {
	var plan service.MonitorPlan
	if u.d.Monitors == nil || u.d.Apps == nil {
		return plan, nil
	}
	files, err := u.d.Apps.List(ctx, gateway.KindFunctions)
	if err != nil {
		return plan, err
	}
	specs := []service.FunctionSpec{}
	for _, f := range files {
		parsed, err := service.ParseFunctionYAML(f.Name, f.YAML)
		if err != nil {
			// 読めない YAML が 1 つあるだけで、ほかの関数のモニターを消してしまわないよう、全体を止める
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
