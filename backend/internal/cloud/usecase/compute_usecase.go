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
		InstanceTypes: []*InstanceType{}, InstanceFamilies: []*InstanceFamily{}, AlertPresets: []*AlertPreset{}, NotifyChannels: service.NotifyChannels,
		MinCpuMillis: service.MinCPUMillis, MaxCpuMillis: service.MaxCPUMillis,
		MinMemory: service.MinMemoryBytes, MaxMemory: service.MaxMemoryBytes,
		StoreEnabled: u.d.Apps != nil, AlertsEnabled: u.d.Monitors != nil,
		Repository: u.d.AppsRepository, Directory: u.d.Environment,
		IdleTimeoutSeconds: int32(u.d.IdleTimeout.Seconds()), HostSuffix: u.d.APITarget.HostSuffix,
		ApiHostSuffix: u.d.APITarget.Suffix(service.HostAPI), CdnHostSuffix: u.d.APITarget.Suffix(service.HostCDN), StorageHostSuffix: u.d.APITarget.Suffix(service.HostStorage),
		CustomDomainZone: u.customDomainZone(),
		StorageEnabled:   u.d.Objects != nil, DnsEnabled: u.d.DNS != nil, DatabasesEnabled: u.d.DatabasesEnabled,
	}
	for _, t := range service.InstanceTypes {
		out.InstanceTypes = append(out.InstanceTypes, &InstanceType{Name: t.Name, Family: service.FamilyOf(t.Name), Memory: t.MemoryBytes, CpuMillis: t.CPUMillis})
	}
	for _, f := range service.InstanceFamilies {
		out.InstanceFamilies = append(out.InstanceFamilies, &InstanceFamily{ID: f.ID, Label: f.Label, Description: f.Description})
	}
	for _, p := range service.AlertPresets {
		out.AlertPresets = append(out.AlertPresets, &AlertPreset{ID: p.ID, Label: p.Label, Description: p.Description})
	}
	return out, nil
}

func (u *ConsoleUsecaseImpl) store() (gateway.ResourceStore, error) {
	if u.d.Apps == nil {
		// アプリは本番だけ（stg・dev にはアプリ用のリポジトリを渡さない）
		if u.d.Environment != "prod" {
			return nil, errs.New(errs.ErrorTypeBadRequest, "アプリ（関数・API・CDN・バケット・データベース）は本番（cloud.taramanji.com）だけで作れます。stg・dev には置きません").WithCode("store_disabled")
		}
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
		CPUMillis: s.CpuMillis, MemoryBytes: s.Memory, Alerts: s.Alerts, Notify: s.Notify, Databases: s.Databases, Buckets: s.Buckets}
	for _, e := range s.Env {
		if e != nil {
			out.Env = append(out.Env, service.EnvVar{Name: e.Name, Value: e.Value})
		}
	}
	return out.Normalize()
}

func functionSpecOut(s service.FunctionSpec) *FunctionSpec {
	out := &FunctionSpec{Name: s.Name, Image: s.Image, Port: s.Port, InstanceType: s.InstanceType,
		CpuMillis: s.CPUMillis, Memory: s.MemoryBytes, Env: []*EnvVar{}, Alerts: s.Alerts, Notify: s.Notify, Databases: s.Databases, Buckets: s.Buckets}
	for _, e := range s.Env {
		out.Env = append(out.Env, &EnvVar{Name: e.Name, Value: e.Value})
	}
	return out
}

// functionOf はリポジトリの YAML と、クラスターの状態（なければ nil）から関数を作る。
// 手で push した YAML が読めないときも一覧から消さず、problem に理由を入れる
func (u *ConsoleUsecaseImpl) functionOf(f gateway.ResourceFile, w *gateway.Workload, apis []string) *Function {
	fn := &Function{Spec: &FunctionSpec{Name: f.Name, Env: []*EnvVar{}, Alerts: []string{}, Notify: []string{}, Databases: []string{}, Buckets: []string{}}, Apis: apis,
		Source: &Source{Yaml: f.YAML, Revision: f.Revision, URL: u.d.Apps.URL(gateway.KindFunctions, f.Name)}}
	if fn.Apis == nil {
		fn.Apis = []string{}
	}
	if w != nil {
		fn.Deployed, fn.Ready, fn.Desired = true, w.Ready, w.Desired
	}
	parsed, err := service.ParseFunctionYAML(f.Name, f.YAML, u.functionNamespace(f.Name))
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
	y, err := service.RenderFunctionYAML(spec, u.functionNamespace(spec.Name))
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
	var spec service.FunctionSpec
	if y == "" {
		spec = functionSpecOf(in.Spec)
		if err := spec.Validate(); err != nil {
			return nil, invalid(err)
		}
		if y, err = service.RenderFunctionYAML(spec, u.functionNamespace(spec.Name)); err != nil {
			return nil, errs.NewInternalError(err)
		}
	} else {
		parsed, err := service.ParseFunctionYAML(name, y, u.functionNamespace(name))
		if err != nil {
			return nil, invalid(err)
		}
		spec = parsed.Spec
	}
	if err := u.checkConnections(ctx, spec); err != nil {
		return nil, err
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
	// キー（keys）はここでは受け取らない。作る・消すは CreateApiKey・DeleteApiKey で、保存のときは今のキーを残す
	out := service.APISpec{Name: s.Name, Auth: s.Auth, CORSOrigins: s.CorsOrigins}
	for _, r := range s.Routes {
		if r != nil {
			out.Routes = append(out.Routes, service.APIRoute{Path: r.Path, Function: r.Function})
		}
	}
	return out.Normalize()
}

func (u *ConsoleUsecaseImpl) apiOf(f gateway.ResourceFile) *Api {
	api := &Api{Spec: &ApiSpec{Name: f.Name, Routes: []*ApiRoute{}}, Host: u.d.APITarget.Host(service.HostAPI, f.Name),
		Source: &Source{Yaml: f.YAML, Revision: f.Revision, URL: u.d.Apps.URL(gateway.KindAPIs, f.Name)}}
	parsed, err := service.ParseAPIYAML(f.Name, f.YAML, u.d.APITarget)
	if err != nil {
		api.Source.Problem = err.Error()
		return api
	}
	for _, r := range parsed.Spec.Routes {
		api.Spec.Routes = append(api.Spec.Routes, &ApiRoute{Path: r.Path, Function: r.Function})
	}
	api.Spec.Auth, api.Spec.CorsOrigins, api.Spec.Keys = parsed.Spec.Auth, parsed.Spec.CORSOrigins, []*ApiKey{}
	for _, k := range parsed.Spec.Keys {
		api.Spec.Keys = append(api.Spec.Keys, &ApiKey{Name: k.Name, Prefix: k.Prefix})
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
		// 今のキーを残す（フォームはキーを送らない）
		if in.Revision != "" {
			if cur, err := store.Get(ctx, gateway.KindAPIs, name); err == nil {
				if parsed, err := service.ParseAPIYAML(name, cur.YAML, u.d.APITarget); err == nil {
					spec.Keys = parsed.Spec.Keys
				}
			}
		}
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
	return &ApplyApiOutput{API: u.apiOf(gateway.ResourceFile{Name: name, YAML: y, Revision: rev}), DnsProblem: u.ensureDNS(ctx, u.d.APITarget.Host(service.HostAPI, name))}, nil
}

func (u *ConsoleUsecaseImpl) DeleteApi(ctx context.Context, in DeleteApiInput) (*DeleteApiOutput, error) {
	store, err := u.store()
	if err != nil {
		return nil, err
	}
	if !service.ValidName(in.Name) {
		return nil, storeErr(gateway.ErrResourceNotFound)
	}
	// CDN の元になっている API は消せない（消すと、その CDN のパスが 404 になる）
	dists, err := u.distributionSpecs(ctx)
	if err != nil {
		return nil, storeErr(err)
	}
	if used := originsOf(dists, service.OriginAPI)[in.Name]; len(used) > 0 {
		return nil, errs.New(errs.ErrorTypeBadRequest, fmt.Sprintf("CDN %v がこの API を元にしています。先に CDN の元を変えるか、CDN を消してください", used)).WithCode("api_in_use")
	}
	if err := store.Delete(ctx, gateway.KindAPIs, in.Name, in.Revision, u.commitMessage(ctx, "delete", "api", in.Name)); err != nil {
		return nil, storeErr(err)
	}
	return &DeleteApiOutput{DnsProblem: u.removeDNS(ctx, u.d.APITarget.Host(service.HostAPI, in.Name))}, nil
}

// ---- API キー ----

// editableAPI は API キーを足す・消すために、今の API を読む。手で直した YAML は、作り直すと消えてしまうので扱わない
func (u *ConsoleUsecaseImpl) editableAPI(ctx context.Context, store gateway.ResourceStore, name string) (service.APISpec, error) {
	if !service.ValidName(name) {
		return service.APISpec{}, storeErr(gateway.ErrResourceNotFound)
	}
	cur, err := store.Get(ctx, gateway.KindAPIs, name)
	if err != nil {
		return service.APISpec{}, storeErr(err)
	}
	parsed, err := service.ParseAPIYAML(name, cur.YAML, u.d.APITarget)
	if err != nil {
		return service.APISpec{}, invalid(err)
	}
	if !parsed.FormEditable {
		return service.APISpec{}, errs.New(errs.ErrorTypeBadRequest, "YAML を手で直している API なので、キーは YAML に書いてください（注釈 "+service.AnnotationAPIKeys+" と "+service.HeaderAPIKeys+"）").WithCode("not_form_editable")
	}
	return parsed.Spec, nil
}

func (u *ConsoleUsecaseImpl) saveAPI(ctx context.Context, store gateway.ResourceStore, spec service.APISpec, revision, what string) (*Api, error) {
	if err := spec.Validate(); err != nil {
		return nil, invalid(err)
	}
	y, err := service.RenderAPIYAML(spec, u.d.APITarget)
	if err != nil {
		return nil, errs.NewInternalError(err)
	}
	rev, err := store.Put(ctx, gateway.KindAPIs, spec.Name, y, revision, u.commitMessage(ctx, "update", "api", spec.Name+" "+what))
	if err != nil {
		return nil, storeErr(err)
	}
	return u.apiOf(gateway.ResourceFile{Name: spec.Name, YAML: y, Revision: rev}), nil
}

// CreateApiKey は API キーを作り、ハッシュだけを YAML に足す。キーそのものは返り値で 1 回だけ渡す
func (u *ConsoleUsecaseImpl) CreateApiKey(ctx context.Context, in CreateApiKeyInput) (*CreateApiKeyOutput, error) {
	store, err := u.store()
	if err != nil {
		return nil, err
	}
	spec, err := u.editableAPI(ctx, store, in.API)
	if err != nil {
		return nil, err
	}
	if !service.ValidName(in.Name) {
		return nil, errs.NewValidationError("name", "キーの名前は英小文字で始め、英小文字・数字・ハイフンで 40 文字までにしてください").WithCode("invalid")
	}
	if slices.ContainsFunc(spec.Keys, func(k service.APIKey) bool { return k.Name == in.Name }) {
		return nil, errs.NewValidationError("name", fmt.Sprintf("キー %q はもうあります", in.Name)).WithCode("invalid")
	}
	if len(spec.Keys) >= service.MaxAPIKeys {
		return nil, errs.NewValidationError("name", fmt.Sprintf("キーは %d 個までです。使っていないキーを消してください", service.MaxAPIKeys)).WithCode("invalid")
	}
	key, meta, err := service.NewAPIKey(in.Name)
	if err != nil {
		return nil, errs.NewInternalError(err)
	}
	spec.Keys = append(spec.Keys, meta)
	api, err := u.saveAPI(ctx, store, spec.Normalize(), in.Revision, "(key "+in.Name+" を作る)")
	if err != nil {
		return nil, err
	}
	return &CreateApiKeyOutput{API: api, Key: key}, nil
}

func (u *ConsoleUsecaseImpl) DeleteApiKey(ctx context.Context, in DeleteApiKeyInput) (*DeleteApiKeyOutput, error) {
	store, err := u.store()
	if err != nil {
		return nil, err
	}
	spec, err := u.editableAPI(ctx, store, in.API)
	if err != nil {
		return nil, err
	}
	keys := slices.DeleteFunc(slices.Clone(spec.Keys), func(k service.APIKey) bool { return k.Name == in.Name })
	if len(keys) == len(spec.Keys) {
		return nil, errs.New(errs.ErrorTypeNotFound, fmt.Sprintf("キー %q はありません", in.Name)).WithCode("not_found")
	}
	spec.Keys = keys
	api, err := u.saveAPI(ctx, store, spec, in.Revision, "(key "+in.Name+" を消す)")
	if err != nil {
		return nil, err
	}
	return &DeleteApiKeyOutput{API: api}, nil
}

// ---- ホスト名（<名前>-<サービス>-cloud.taramanji.com）----

// hostFree は新しく作るとき、もう一方の種類（API なら CDN、CDN なら API）が同じ名前を使っていないか確かめる。
// ホスト名はサービスごとに分かれているが、HTTPRoute の名前（= <名前>）が同じ namespace でぶつかるので、名前は API と CDN で共通にする。
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
	other := map[string]string{gateway.KindAPIs: "API", gateway.KindCDN: "CDN"}[otherKind]
	return errs.New(errs.ErrorTypeDuplicate, fmt.Sprintf("%s は %s が使っています（API と CDN で同じ名前は使えません）", name, other)).WithCode("host_taken")
}

// ensureDNS はホスト名の DNS を登録する。失敗しても YAML の保存は戻さず、理由を返す（空なら問題なし）
func (u *ConsoleUsecaseImpl) ensureDNS(ctx context.Context, host string) string {
	if u.d.DNS == nil {
		return ""
	}
	if err := u.d.DNS.Ensure(ctx, host); err != nil {
		return err.Error()
	}
	return ""
}

func (u *ConsoleUsecaseImpl) removeDNS(ctx context.Context, host string) string {
	if u.d.DNS == nil {
		return ""
	}
	if err := u.d.DNS.Remove(ctx, host); err != nil {
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
		parsed, err := service.ParseFunctionYAML(f.Name, f.YAML, u.functionNamespace(f.Name))
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

// functionNamespace は関数ごとの namespace（この環境の）
func (u *ConsoleUsecaseImpl) functionNamespace(name string) string {
	return service.FunctionNamespace(u.d.Environment, name)
}
