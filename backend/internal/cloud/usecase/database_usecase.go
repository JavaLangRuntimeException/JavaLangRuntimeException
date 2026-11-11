package usecase

import (
	"context"
	"fmt"
	"slices"
	"sort"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/service"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/errs"
)

// functionSpecs はリポジトリの関数のうち、読めるものの定義
func (u *ConsoleUsecaseImpl) functionSpecs(ctx context.Context) ([]service.FunctionSpec, error) {
	files, err := u.d.Apps.List(ctx, gateway.KindFunctions)
	if err != nil {
		return nil, err
	}
	out := []service.FunctionSpec{}
	for _, f := range files {
		if parsed, err := service.ParseFunctionYAML(f.Name, f.YAML); err == nil {
			out = append(out, parsed.Spec)
		}
	}
	return out, nil
}

// connectedBy は、つないでいるリソースの名前 → 関数の名前
func connectedBy(fns []service.FunctionSpec, pick func(service.FunctionSpec) []string) map[string][]string {
	out := map[string][]string{}
	for _, f := range fns {
		for _, n := range pick(f) {
			out[n] = append(out[n], f.Name)
		}
	}
	for _, names := range out {
		sort.Strings(names)
	}
	return out
}

func databasesOf(f service.FunctionSpec) []string { return f.Databases }
func bucketsOf(f service.FunctionSpec) []string   { return f.Buckets }

// checkConnections は、関数がつなごうとしているデータベースとバケットがあるか確かめる
// （ないものをつなぐと、接続先の Secret がなくて関数が起動できない）
func (u *ConsoleUsecaseImpl) checkConnections(ctx context.Context, spec service.FunctionSpec) error {
	for _, c := range []struct {
		kind, label, field string
		names              []string
	}{{gateway.KindDatabases, "データベース", "databases", spec.Databases}, {gateway.KindBuckets, "バケット", "buckets", spec.Buckets}} {
		if len(c.names) == 0 {
			continue
		}
		files, err := u.d.Apps.List(ctx, c.kind)
		if err != nil {
			return storeErr(err)
		}
		for _, n := range c.names {
			if !slices.ContainsFunc(files, func(f gateway.ResourceFile) bool { return f.Name == n }) {
				return errs.NewValidationError(c.field, fmt.Sprintf("%s %q がありません", c.label, n)).WithCode("invalid")
			}
		}
	}
	return nil
}

func (u *ConsoleUsecaseImpl) databaseOf(f gateway.ResourceFile, status string, fns []string) *Database {
	d := &Database{Name: f.Name, Functions: fns, EnvNames: []string{}, Status: status,
		Source: &Source{Yaml: f.YAML, Revision: f.Revision, URL: u.d.Apps.URL(gateway.KindDatabases, f.Name)}}
	if d.Functions == nil {
		d.Functions = []string{}
	}
	engine, err := service.ParseDatabaseYAML(f.Name, f.YAML)
	if err != nil {
		d.Source.Problem = err.Error()
		return d
	}
	d.Engine, d.EnvNames = engine, service.DatabaseEnvNames(f.Name, engine)
	d.Ready = status == service.StatusReady
	if d.Status == "" {
		d.Status = "pending"
	}
	return d
}

func (u *ConsoleUsecaseImpl) ListDatabases(ctx context.Context, _ ListDatabasesInput) (*ListDatabasesOutput, error) {
	store, err := u.store()
	if err != nil {
		return nil, err
	}
	files, err := store.List(ctx, gateway.KindDatabases)
	if err != nil {
		return nil, storeErr(err)
	}
	fns, err := u.functionSpecs(ctx)
	if err != nil {
		return nil, storeErr(err)
	}
	used := connectedBy(fns, databasesOf)
	// コントローラーが ConfigMap の注釈に書いた状態。読めなくても定義の一覧は出す
	status := map[string]string{}
	if u.d.State != nil {
		if cms, err := u.d.State.ConfigMaps(ctx, service.LabelDatabase); err == nil {
			for _, cm := range cms {
				status[cm.Labels[service.LabelDatabase]] = cm.Annotations[service.AnnotationStatus]
			}
		}
	}
	out := &ListDatabasesOutput{Databases: []*Database{}}
	for _, f := range files {
		out.Databases = append(out.Databases, u.databaseOf(f, status[f.Name], used[f.Name]))
	}
	sort.Slice(out.Databases, func(i, j int) bool { return out.Databases[i].Name < out.Databases[j].Name })
	return out, nil
}

func (u *ConsoleUsecaseImpl) CreateDatabase(ctx context.Context, in CreateDatabaseInput) (*CreateDatabaseOutput, error) {
	store, err := u.store()
	if err != nil {
		return nil, err
	}
	if !service.ValidName(in.Name) {
		_, err := service.ParseDatabaseYAML(in.Name, "")
		return nil, invalid(err)
	}
	if !slices.Contains(service.Engines, in.Engine) {
		return nil, errs.NewValidationError("engine", "エンジンは postgres か redis です").WithCode("invalid")
	}
	y, err := service.RenderDatabaseYAML(in.Name, in.Engine)
	if err != nil {
		return nil, errs.NewInternalError(err)
	}
	rev, err := store.Put(ctx, gateway.KindDatabases, in.Name, y, "", u.commitMessage(ctx, "create", "database", in.Name))
	if err != nil {
		return nil, storeErr(err)
	}
	return &CreateDatabaseOutput{Database: u.databaseOf(gateway.ResourceFile{Name: in.Name, YAML: y, Revision: rev}, "", nil)}, nil
}

func (u *ConsoleUsecaseImpl) DeleteDatabase(ctx context.Context, in DeleteDatabaseInput) error {
	store, err := u.store()
	if err != nil {
		return err
	}
	if !service.ValidName(in.Name) {
		return storeErr(gateway.ErrResourceNotFound)
	}
	fns, err := u.functionSpecs(ctx)
	if err != nil {
		return storeErr(err)
	}
	if used := connectedBy(fns, databasesOf)[in.Name]; len(used) > 0 {
		return errs.New(errs.ErrorTypeBadRequest, fmt.Sprintf("関数 %v がこのデータベースをつないでいます。先に関数から外してください", used)).WithCode("database_in_use")
	}
	if err := store.Delete(ctx, gateway.KindDatabases, in.Name, in.Revision, u.commitMessage(ctx, "delete", "database", in.Name)); err != nil {
		return storeErr(err)
	}
	return nil
}
