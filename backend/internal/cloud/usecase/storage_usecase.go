package usecase

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"sort"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/service"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/errs"
)

func (u *ConsoleUsecaseImpl) objects() (gateway.ObjectStore, error) {
	if u.d.Objects == nil {
		return nil, errs.New(errs.ErrorTypeBadRequest, "この環境ではオブジェクトストレージが動いていません").WithCode("storage_disabled")
	}
	return u.d.Objects, nil
}

func objectErr(err error) error {
	if errors.Is(err, gateway.ErrObjectNotFound) {
		return errs.New(errs.ErrorTypeNotFound, "見つかりません").WithCode("not_found")
	}
	return errs.New(errs.ErrorTypeUpstream, "オブジェクトストレージとやり取りできませんでした").WithCode("storage_failed").WithCause(err)
}

// distributionSpecs はリポジトリの CDN のうち、読めるものの定義
func (u *ConsoleUsecaseImpl) distributionSpecs(ctx context.Context) ([]service.DistributionSpec, error) {
	files, err := u.d.Apps.List(ctx, gateway.KindCDN)
	if err != nil {
		return nil, err
	}
	out := []service.DistributionSpec{}
	for _, f := range files {
		if parsed, err := service.ParseDistributionYAML(f.Name, f.YAML, u.d.APITarget); err == nil {
			out = append(out, parsed.Spec)
		}
	}
	return out, nil
}

// originsOf は元の名前 → それを元にしている CDN の名前
func originsOf(dists []service.DistributionSpec, originType string) map[string][]string {
	out := map[string][]string{}
	for _, d := range dists {
		if d.OriginType == originType {
			out[d.Origin] = append(out[d.Origin], d.Name)
		}
	}
	for _, names := range out {
		sort.Strings(names)
	}
	return out
}

// ---- バケット ----

func (u *ConsoleUsecaseImpl) bucketOf(f gateway.ResourceFile, usage *gateway.BucketUsage, dists []string) *Bucket {
	b := &Bucket{Name: f.Name, Distributions: dists,
		Source: &Source{Yaml: f.YAML, Revision: f.Revision, URL: u.d.Apps.URL(gateway.KindBuckets, f.Name)}}
	if b.Distributions == nil {
		b.Distributions = []string{}
	}
	if err := service.ParseBucketYAML(f.Name, f.YAML); err != nil {
		b.Source.Problem = err.Error()
	}
	if usage != nil {
		b.Ready, b.Objects, b.Bytes = true, usage.Objects, usage.Bytes
	}
	return b
}

func (u *ConsoleUsecaseImpl) ListBuckets(ctx context.Context, _ ListBucketsInput) (*ListBucketsOutput, error) {
	store, err := u.store()
	if err != nil {
		return nil, err
	}
	files, err := store.List(ctx, gateway.KindBuckets)
	if err != nil {
		return nil, storeErr(err)
	}
	dists, err := u.distributionSpecs(ctx)
	if err != nil {
		return nil, storeErr(err)
	}
	used := originsOf(dists, service.OriginBucket)
	usage := map[string]*gateway.BucketUsage{}
	if u.d.Objects != nil {
		// 使用量が読めなくても、定義の一覧は出す
		if list, err := u.d.Objects.Buckets(ctx); err == nil {
			for i := range list {
				usage[list[i].Name] = &list[i]
			}
		}
	}
	out := &ListBucketsOutput{Buckets: []*Bucket{}}
	for _, f := range files {
		out.Buckets = append(out.Buckets, u.bucketOf(f, usage[f.Name], used[f.Name]))
	}
	sort.Slice(out.Buckets, func(i, j int) bool { return out.Buckets[i].Name < out.Buckets[j].Name })
	return out, nil
}

func (u *ConsoleUsecaseImpl) CreateBucket(ctx context.Context, in CreateBucketInput) (*CreateBucketOutput, error) {
	store, err := u.store()
	if err != nil {
		return nil, err
	}
	if !service.ValidName(in.Name) {
		return nil, invalid(service.ParseBucketYAML(in.Name, ""))
	}
	y, err := service.RenderBucketYAML(in.Name)
	if err != nil {
		return nil, errs.NewInternalError(err)
	}
	rev, err := store.Put(ctx, gateway.KindBuckets, in.Name, y, "", u.commitMessage(ctx, "create", "bucket", in.Name))
	if err != nil {
		return nil, storeErr(err)
	}
	return &CreateBucketOutput{Bucket: u.bucketOf(gateway.ResourceFile{Name: in.Name, YAML: y, Revision: rev}, nil, nil)}, nil
}

func (u *ConsoleUsecaseImpl) DeleteBucket(ctx context.Context, in DeleteBucketInput) error {
	store, err := u.store()
	if err != nil {
		return err
	}
	if !service.ValidName(in.Name) {
		return storeErr(gateway.ErrResourceNotFound)
	}
	dists, err := u.distributionSpecs(ctx)
	if err != nil {
		return storeErr(err)
	}
	if used := originsOf(dists, service.OriginBucket)[in.Name]; len(used) > 0 {
		return errs.New(errs.ErrorTypeBadRequest, fmt.Sprintf("CDN %v がこのバケットを元にしています。先に CDN を消してください", used)).WithCode("bucket_in_use")
	}
	fns, err := u.functionSpecs(ctx)
	if err != nil {
		return storeErr(err)
	}
	if used := connectedBy(fns, bucketsOf)[in.Name]; len(used) > 0 {
		return errs.New(errs.ErrorTypeBadRequest, fmt.Sprintf("関数 %v がこのバケットをつないでいます。先に関数から外してください", used)).WithCode("bucket_in_use")
	}
	// 中身があるバケットは消させない（YAML を消しても、ストレージは中身のあるバケットを残す）。
	// ストレージが動いていない・読めないときは、空かどうかわからないので消さない
	if u.d.Objects != nil {
		objs, _, err := u.d.Objects.List(ctx, in.Name, "")
		if err != nil && !errors.Is(err, gateway.ErrObjectNotFound) {
			return objectErr(err)
		}
		if len(objs) > 0 {
			return errs.New(errs.ErrorTypeBadRequest, "バケットにオブジェクトが残っています。先に全部消してください").WithCode("bucket_not_empty")
		}
	}
	if err := store.Delete(ctx, gateway.KindBuckets, in.Name, in.Revision, u.commitMessage(ctx, "delete", "bucket", in.Name)); err != nil {
		return storeErr(err)
	}
	return nil
}

func (u *ConsoleUsecaseImpl) ListObjects(ctx context.Context, in ListObjectsInput) (*ListObjectsOutput, error) {
	objs, err := u.objects()
	if err != nil {
		return nil, err
	}
	if !service.ValidName(in.Bucket) {
		return nil, objectErr(gateway.ErrObjectNotFound)
	}
	list, truncated, err := objs.List(ctx, in.Bucket, in.Prefix)
	if err != nil {
		return nil, objectErr(err)
	}
	out := &ListObjectsOutput{Objects: []*StorageObject{}, Truncated: truncated}
	for _, o := range list {
		out.Objects = append(out.Objects, &StorageObject{Key: o.Key, Size: o.Size, ModifiedMs: o.Modified.UnixMilli()})
	}
	return out, nil
}

func (u *ConsoleUsecaseImpl) DeleteObject(ctx context.Context, in DeleteObjectInput) error {
	objs, err := u.objects()
	if err != nil {
		return err
	}
	if !service.ValidName(in.Bucket) {
		return objectErr(gateway.ErrObjectNotFound)
	}
	if err := objs.Delete(ctx, in.Bucket, in.Key); err != nil {
		return objectErr(err)
	}
	return nil
}

// ---- CDN ----

func distributionSpecOf(s *DistributionSpec) service.DistributionSpec {
	if s == nil {
		return service.DistributionSpec{}
	}
	return service.DistributionSpec{Name: s.Name, OriginType: s.OriginType, Origin: s.Origin, CacheSeconds: s.CacheSeconds, SPA: s.Spa}
}

func (u *ConsoleUsecaseImpl) distributionOf(f gateway.ResourceFile) *Distribution {
	d := &Distribution{Spec: &DistributionSpec{Name: f.Name}, Host: service.HostOf(f.Name, u.d.APITarget.HostSuffix),
		Source: &Source{Yaml: f.YAML, Revision: f.Revision, URL: u.d.Apps.URL(gateway.KindCDN, f.Name)}}
	parsed, err := service.ParseDistributionYAML(f.Name, f.YAML, u.d.APITarget)
	if err != nil {
		d.Source.Problem = err.Error()
		return d
	}
	sp := parsed.Spec
	d.Spec = &DistributionSpec{Name: sp.Name, OriginType: sp.OriginType, Origin: sp.Origin, CacheSeconds: sp.CacheSeconds, Spa: sp.SPA}
	d.Source.FormEditable = parsed.FormEditable
	return d
}

func (u *ConsoleUsecaseImpl) ListDistributions(ctx context.Context, _ ListDistributionsInput) (*ListDistributionsOutput, error) {
	store, err := u.store()
	if err != nil {
		return nil, err
	}
	files, err := store.List(ctx, gateway.KindCDN)
	if err != nil {
		return nil, storeErr(err)
	}
	out := &ListDistributionsOutput{Distributions: []*Distribution{}}
	for _, f := range files {
		out.Distributions = append(out.Distributions, u.distributionOf(f))
	}
	sort.Slice(out.Distributions, func(i, j int) bool { return out.Distributions[i].Spec.Name < out.Distributions[j].Spec.Name })
	return out, nil
}

func (u *ConsoleUsecaseImpl) PreviewDistribution(_ context.Context, in PreviewDistributionInput) (*PreviewDistributionOutput, error) {
	spec := distributionSpecOf(in.Spec)
	if err := spec.Validate(); err != nil {
		return nil, invalid(err)
	}
	y, err := service.RenderDistributionYAML(spec, u.d.APITarget)
	if err != nil {
		return nil, errs.NewInternalError(err)
	}
	return &PreviewDistributionOutput{Yaml: y}, nil
}

func (u *ConsoleUsecaseImpl) ApplyDistribution(ctx context.Context, in ApplyDistributionInput) (*ApplyDistributionOutput, error) {
	store, err := u.store()
	if err != nil {
		return nil, err
	}
	if in.Spec == nil || !service.ValidName(in.Spec.Name) {
		return nil, invalid(service.DistributionSpec{}.Validate())
	}
	name, y := in.Spec.Name, in.Yaml
	var spec service.DistributionSpec
	if y == "" {
		spec = distributionSpecOf(in.Spec)
		if err := spec.Validate(); err != nil {
			return nil, invalid(err)
		}
		if y, err = service.RenderDistributionYAML(spec, u.d.APITarget); err != nil {
			return nil, errs.NewInternalError(err)
		}
	} else {
		parsed, err := service.ParseDistributionYAML(name, y, u.d.APITarget)
		if err != nil {
			return nil, invalid(err)
		}
		spec = parsed.Spec
	}
	// ない元には向けられない
	kind, label := gateway.KindBuckets, "バケット"
	if spec.OriginType == service.OriginFunction {
		kind, label = gateway.KindFunctions, "関数"
	}
	origins, err := store.List(ctx, kind)
	if err != nil {
		return nil, storeErr(err)
	}
	if !slices.ContainsFunc(origins, func(f gateway.ResourceFile) bool { return f.Name == spec.Origin }) {
		return nil, errs.NewValidationError("origin", fmt.Sprintf("%s %q がありません", label, spec.Origin)).WithCode("invalid")
	}
	if err := u.hostFree(ctx, gateway.KindAPIs, name, in.Revision); err != nil {
		return nil, err
	}
	rev, err := store.Put(ctx, gateway.KindCDN, name, y, in.Revision, u.commitMessage(ctx, verbOf(in.Revision), "cdn", name))
	if err != nil {
		return nil, storeErr(err)
	}
	return &ApplyDistributionOutput{Distribution: u.distributionOf(gateway.ResourceFile{Name: name, YAML: y, Revision: rev}), DnsProblem: u.ensureDNS(ctx, name)}, nil
}

func (u *ConsoleUsecaseImpl) DeleteDistribution(ctx context.Context, in DeleteDistributionInput) (*DeleteDistributionOutput, error) {
	store, err := u.store()
	if err != nil {
		return nil, err
	}
	if !service.ValidName(in.Name) {
		return nil, storeErr(gateway.ErrResourceNotFound)
	}
	if err := store.Delete(ctx, gateway.KindCDN, in.Name, in.Revision, u.commitMessage(ctx, "delete", "cdn", in.Name)); err != nil {
		return nil, storeErr(err)
	}
	return &DeleteDistributionOutput{DnsProblem: u.removeDNS(ctx, in.Name)}, nil
}
