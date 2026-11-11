package usecase

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"slices"
	"sort"
	"strings"

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
		// パスごとの元も数える（1 つの CDN が同じ元を何度使っても 1 回）
		for _, o := range d.Uses(originType) {
			out[o] = append(out[o], d.Name)
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
	if parsed, err := service.ParseBucketYAML(f.Name, f.YAML, u.d.APITarget); err != nil {
		b.Source.Problem = err.Error()
	} else if parsed.Public {
		b.Public, b.PublicHost = true, u.d.APITarget.Host(service.HostStorage, f.Name)
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
		_, err := service.ParseBucketYAML(in.Name, "", u.d.APITarget)
		return nil, invalid(err)
	}
	y, err := service.RenderBucketYAML(in.Name, in.Public, u.d.APITarget)
	if err != nil {
		return nil, errs.NewInternalError(err)
	}
	rev, err := store.Put(ctx, gateway.KindBuckets, in.Name, y, "", u.commitMessage(ctx, "create", "bucket", in.Name))
	if err != nil {
		return nil, storeErr(err)
	}
	out := &CreateBucketOutput{Bucket: u.bucketOf(gateway.ResourceFile{Name: in.Name, YAML: y, Revision: rev}, nil, nil)}
	if in.Public {
		out.DnsProblem = u.ensureDNS(ctx, u.d.APITarget.Host(service.HostStorage, in.Name))
	}
	return out, nil
}

// UpdateBucket は公開（ログインなしの配信）を切り替える。オンにすると <バケット>-storage-cloud.taramanji.com の DNS を登録し、オフにすると消す
func (u *ConsoleUsecaseImpl) UpdateBucket(ctx context.Context, in UpdateBucketInput) (*UpdateBucketOutput, error) {
	store, err := u.store()
	if err != nil {
		return nil, err
	}
	if !service.ValidName(in.Name) {
		return nil, storeErr(gateway.ErrResourceNotFound)
	}
	cur, err := store.Get(ctx, gateway.KindBuckets, in.Name)
	if err != nil {
		return nil, storeErr(err)
	}
	was, err := service.ParseBucketYAML(in.Name, cur.YAML, u.d.APITarget)
	if err != nil {
		return nil, invalid(err)
	}
	y, err := service.RenderBucketYAML(in.Name, in.Public, u.d.APITarget)
	if err != nil {
		return nil, errs.NewInternalError(err)
	}
	rev, err := store.Put(ctx, gateway.KindBuckets, in.Name, y, in.Revision, u.commitMessage(ctx, "update", "bucket", in.Name))
	if err != nil {
		return nil, storeErr(err)
	}
	host := u.d.APITarget.Host(service.HostStorage, in.Name)
	out := &UpdateBucketOutput{Bucket: u.bucketOf(gateway.ResourceFile{Name: in.Name, YAML: y, Revision: rev}, nil, nil)}
	if in.Public {
		out.DnsProblem = u.ensureDNS(ctx, host)
	} else {
		out.DnsProblem = u.removeDNS(ctx, host)
		// 公開をやめたら、エッジに残ったファイルも消す（ブラウザが持っている分は期限まで残る）
		if was.Public {
			out.CacheProblem = u.purgeHosts(ctx, []string{host})
		}
	}
	return out, nil
}

// DeleteBucket は空で、どこからも使われていないバケットを消す。公開していたら、そのホスト名の DNS も消す
func (u *ConsoleUsecaseImpl) DeleteBucket(ctx context.Context, in DeleteBucketInput) (*DeleteBucketOutput, error) {
	store, err := u.store()
	if err != nil {
		return nil, err
	}
	if !service.ValidName(in.Name) {
		return nil, storeErr(gateway.ErrResourceNotFound)
	}
	dists, err := u.distributionSpecs(ctx)
	if err != nil {
		return nil, storeErr(err)
	}
	if used := originsOf(dists, service.OriginBucket)[in.Name]; len(used) > 0 {
		return nil, errs.New(errs.ErrorTypeBadRequest, fmt.Sprintf("CDN %v がこのバケットを元にしています。先に CDN を消してください", used)).WithCode("bucket_in_use")
	}
	fns, err := u.functionSpecs(ctx)
	if err != nil {
		return nil, storeErr(err)
	}
	if used := connectedBy(fns, bucketsOf)[in.Name]; len(used) > 0 {
		return nil, errs.New(errs.ErrorTypeBadRequest, fmt.Sprintf("関数 %v がこのバケットをつないでいます。先に関数から外してください", used)).WithCode("bucket_in_use")
	}
	// 中身があるバケットは消させない（YAML を消しても、ストレージは中身のあるバケットを残す）。
	// ストレージが動いていない・読めないときは、空かどうかわからないので消さない
	if u.d.Objects != nil {
		objs, _, err := u.d.Objects.List(ctx, in.Name, "")
		if err != nil && !errors.Is(err, gateway.ErrObjectNotFound) {
			return nil, objectErr(err)
		}
		if len(objs) > 0 {
			return nil, errs.New(errs.ErrorTypeBadRequest, "バケットにオブジェクトが残っています。先に全部消してください").WithCode("bucket_not_empty")
		}
	}
	public := false
	if cur, err := store.Get(ctx, gateway.KindBuckets, in.Name); err == nil {
		if parsed, err := service.ParseBucketYAML(in.Name, cur.YAML, u.d.APITarget); err == nil {
			public = parsed.Public
		}
	}
	if err := store.Delete(ctx, gateway.KindBuckets, in.Name, in.Revision, u.commitMessage(ctx, "delete", "bucket", in.Name)); err != nil {
		return nil, storeErr(err)
	}
	out := &DeleteBucketOutput{}
	if public {
		host := u.d.APITarget.Host(service.HostStorage, in.Name)
		out.DnsProblem = u.removeDNS(ctx, host)
		out.CacheProblem = u.purgeHosts(ctx, []string{host})
	}
	return out, nil
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

func (u *ConsoleUsecaseImpl) DeleteObject(ctx context.Context, in DeleteObjectInput) (*DeleteObjectOutput, error) {
	objs, err := u.objects()
	if err != nil {
		return nil, err
	}
	if !service.ValidName(in.Bucket) {
		return nil, objectErr(gateway.ErrObjectNotFound)
	}
	if err := objs.Delete(ctx, in.Bucket, in.Key); err != nil {
		return nil, objectErr(err)
	}
	// 消したファイルが、公開の URL や CDN のエッジに残らないようにする
	return &DeleteObjectOutput{CacheProblem: u.purgeKeys(ctx, in.Bucket, []string{in.Key})}, nil
}

// ---- キャッシュの消去 ----

// MaxPurgeKeys は 1 回に URL で消せるファイルの数
const MaxPurgeKeys = 100

// PurgeCache は Cloudflare のエッジのキャッシュを消す。バケットなら、そのバケットを配っている公開の URL と CDN、CDN ならその CDN のホスト名
func (u *ConsoleUsecaseImpl) PurgeCache(ctx context.Context, in PurgeCacheInput) (*PurgeCacheOutput, error) {
	if u.d.Purger == nil {
		return nil, errs.New(errs.ErrorTypeBadRequest, "キャッシュを消すトークン（Cloudflare の Cache Purge の権限）がありません").WithCode("purge_disabled")
	}
	if !service.ValidName(in.Name) {
		return nil, storeErr(gateway.ErrResourceNotFound)
	}
	switch in.Kind {
	case "bucket":
		if len(in.Keys) > MaxPurgeKeys {
			return nil, errs.NewValidationError("keys", fmt.Sprintf("一度に消せるのは %d 個までです", MaxPurgeKeys)).WithCode("invalid")
		}
		hosts, _, err := u.bucketHosts(ctx, in.Name)
		if err != nil {
			return nil, err
		}
		out := &PurgeCacheOutput{Hosts: hosts}
		if len(in.Keys) > 0 {
			out.Problem = u.purgeKeys(ctx, in.Name, in.Keys)
		} else {
			out.Problem = u.purgeHosts(ctx, hosts)
		}
		return out, nil
	case "cdn":
		store, err := u.store()
		if err != nil {
			return nil, err
		}
		cur, err := store.Get(ctx, gateway.KindCDN, in.Name)
		if err != nil {
			return nil, storeErr(err)
		}
		parsed, err := service.ParseDistributionYAML(in.Name, cur.YAML, u.d.APITarget)
		if err != nil {
			return nil, invalid(err)
		}
		hosts := parsed.Spec.Hosts(u.d.APITarget)
		return &PurgeCacheOutput{Hosts: hosts, Problem: u.purgeHosts(ctx, hosts)}, nil
	default:
		return nil, errs.NewValidationError("kind", "bucket か cdn を指定してください").WithCode("invalid")
	}
}

// bucketHosts はバケットを配っているホスト名（公開しているなら <バケット>-storage-cloud と、そのバケットを元にしている CDN のホスト名・独自ドメイン）。
// spa はそのうち、SPA（ないパスに index.html を返す）で配っているホスト名
func (u *ConsoleUsecaseImpl) bucketHosts(ctx context.Context, bucket string) (hosts, spa []string, err error) {
	store, err := u.store()
	if err != nil {
		return nil, nil, err
	}
	hosts, spa = []string{}, []string{}
	if cur, err := store.Get(ctx, gateway.KindBuckets, bucket); err == nil {
		if parsed, err := service.ParseBucketYAML(bucket, cur.YAML, u.d.APITarget); err == nil && parsed.Public {
			hosts = append(hosts, u.d.APITarget.Host(service.HostStorage, bucket))
		}
	}
	dists, err := u.distributionSpecs(ctx)
	if err != nil {
		return nil, nil, storeErr(err)
	}
	for _, d := range dists {
		if !slices.Contains(d.Uses(service.OriginBucket), bucket) {
			continue
		}
		hs := d.Hosts(u.d.APITarget)
		hosts = append(hosts, hs...)
		if slices.ContainsFunc(d.Origins(), func(o service.DistributionOrigin) bool {
			return o.OriginType == service.OriginBucket && o.Origin == bucket && o.SPA
		}) {
			spa = append(spa, hs...)
		}
	}
	return hosts, spa, nil
}

// purgeHosts はホスト名ごとキャッシュを消す。消せなくても処理は戻さず、理由を返す（空なら問題なし）
func (u *ConsoleUsecaseImpl) purgeHosts(ctx context.Context, hosts []string) string {
	if u.d.Purger == nil || len(hosts) == 0 {
		return ""
	}
	if err := u.d.Purger.PurgeHosts(ctx, hosts); err != nil {
		return "キャッシュを消せませんでした（期限が切れるまで古いものが見えます）: " + err.Error()
	}
	return ""
}

// purgeKeys はバケットのファイル（keys）の URL だけキャッシュを消す。<dir>/index.html は <dir>/ の URL も消す。
// SPA で配っている CDN は、ないパスの応答も index.html なので、index.html が変わったらホスト名ごと消す
func (u *ConsoleUsecaseImpl) purgeKeys(ctx context.Context, bucket string, keys []string) string {
	if u.d.Purger == nil || len(keys) == 0 {
		return ""
	}
	hosts, spa, err := u.bucketHosts(ctx, bucket)
	if err != nil || len(hosts) == 0 {
		return ""
	}
	urls := []string{}
	indexChanged := false
	for _, h := range hosts {
		for _, k := range keys {
			urls = append(urls, (&url.URL{Scheme: "https", Host: h, Path: "/" + k}).String())
			if k == "index.html" || strings.HasSuffix(k, "/index.html") {
				indexChanged = true
				urls = append(urls, (&url.URL{Scheme: "https", Host: h, Path: "/" + strings.TrimSuffix(k, "index.html")}).String())
			}
		}
	}
	if err := u.d.Purger.PurgeURLs(ctx, urls); err != nil {
		return "キャッシュを消せませんでした（期限が切れるまで古いものが見えます）: " + err.Error()
	}
	if indexChanged && len(spa) > 0 {
		return u.purgeHosts(ctx, spa)
	}
	return ""
}

// ---- CDN ----

func distributionSpecOf(s *DistributionSpec) service.DistributionSpec {
	if s == nil {
		return service.DistributionSpec{}
	}
	spec := service.DistributionSpec{Name: s.Name, OriginType: s.OriginType, Origin: s.Origin, CacheSeconds: s.CacheSeconds, SPA: s.Spa, Aliases: s.Aliases}
	for _, b := range s.Behaviors {
		if b != nil {
			spec.Behaviors = append(spec.Behaviors, service.DistributionOrigin{Path: b.Path, OriginType: b.OriginType, Origin: b.Origin, CacheSeconds: b.CacheSeconds, SPA: b.Spa})
		}
	}
	return spec.Normalize()
}

func (u *ConsoleUsecaseImpl) distributionOf(f gateway.ResourceFile) *Distribution {
	d := &Distribution{Spec: &DistributionSpec{Name: f.Name}, Host: u.d.APITarget.Host(service.HostCDN, f.Name),
		Source: &Source{Yaml: f.YAML, Revision: f.Revision, URL: u.d.Apps.URL(gateway.KindCDN, f.Name)}}
	parsed, err := service.ParseDistributionYAML(f.Name, f.YAML, u.d.APITarget)
	if err != nil {
		d.Source.Problem = err.Error()
		return d
	}
	sp := parsed.Spec
	d.Spec = &DistributionSpec{Name: sp.Name, OriginType: sp.OriginType, Origin: sp.Origin, CacheSeconds: sp.CacheSeconds, Spa: sp.SPA}
	for _, b := range sp.Behaviors {
		d.Spec.Behaviors = append(d.Spec.Behaviors, &DistributionBehavior{Path: b.Path, OriginType: b.OriginType, Origin: b.Origin, CacheSeconds: b.CacheSeconds, Spa: b.SPA})
	}
	d.Spec.Aliases = append([]string{}, sp.Aliases...)
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
		if err := spec.ValidateAliases(u.d.APITarget); err != nil {
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
	// ない元には向けられない（既定の元も、パスごとの元も）
	for _, t := range []struct{ originType, kind, label string }{
		{service.OriginBucket, gateway.KindBuckets, "バケット"}, {service.OriginAPI, gateway.KindAPIs, "API"},
	} {
		used := spec.Uses(t.originType)
		if len(used) == 0 {
			continue
		}
		origins, err := store.List(ctx, t.kind)
		if err != nil {
			return nil, storeErr(err)
		}
		for _, name := range used {
			if !slices.ContainsFunc(origins, func(f gateway.ResourceFile) bool { return f.Name == name }) {
				field := "behaviors"
				if d := spec.Default(); d.OriginType == t.originType && d.Origin == name {
					field = "origin"
				}
				return nil, errs.NewValidationError(field, fmt.Sprintf("%s %q がありません", t.label, name)).WithCode("invalid")
			}
		}
	}
	if err := u.hostFree(ctx, gateway.KindAPIs, name, in.Revision); err != nil {
		return nil, err
	}
	// 独自ドメイン: Access に登録してから（ログインの後ろに置いてから）DNS を作る。外すときは DNS を消してから Access から外す
	plan, err := u.planAliases(ctx, store, name, in.Revision, spec.Aliases)
	if err != nil {
		return nil, err
	}
	if len(plan.added) > 0 {
		if err := u.d.Access.SetHosts(ctx, plan.protect(spec.Aliases, plan.removed)); err != nil {
			return nil, errs.New(errs.ErrorTypeInternal, "独自ドメインを Cloudflare Access に登録できなかったので、保存していません: "+err.Error()).WithCode("access_failed")
		}
	}
	rev, err := store.Put(ctx, gateway.KindCDN, name, y, in.Revision, u.commitMessage(ctx, verbOf(in.Revision), "cdn", name))
	if err != nil {
		return nil, storeErr(err)
	}
	problems := []string{}
	for _, h := range spec.Hosts(u.d.APITarget) {
		if p := u.ensureDNS(ctx, h); p != "" {
			problems = append(problems, p)
		}
	}
	for _, h := range plan.removed {
		if p := u.removeDNS(ctx, h); p != "" {
			problems = append(problems, p)
		}
	}
	if len(plan.removed) > 0 && u.d.Access != nil {
		if err := u.d.Access.SetHosts(ctx, plan.protect(spec.Aliases)); err != nil {
			problems = append(problems, "Access から外せませんでした（ログインは要るままです）: "+err.Error())
		}
	}
	out := &ApplyDistributionOutput{Distribution: u.distributionOf(gateway.ResourceFile{Name: name, YAML: y, Revision: rev}), DnsProblem: strings.Join(problems, "・")}
	// 変えたら（元・キャッシュの長さなど）、前の設定で持っていたキャッシュを消す
	if in.Revision != "" {
		out.CacheProblem = u.purgeHosts(ctx, append(spec.Hosts(u.d.APITarget), plan.removed...))
	}
	return out, nil
}

// customDomainZone は独自ドメインに使えるゾーン。Access と DNS のどちらかがなければ使えない（"" を返す）
func (u *ConsoleUsecaseImpl) customDomainZone() string {
	if u.d.Access == nil || u.d.DNS == nil {
		return ""
	}
	return u.d.APITarget.AliasZone
}

// aliasPlan は独自ドメインの変更: 足すもの・外すもの、ほかの CDN が使っている独自ドメイン
type aliasPlan struct {
	added, removed, others []string
}

// protect は Access で守るホスト名（ほかの CDN の独自ドメインと、渡したもの）
func (p aliasPlan) protect(lists ...[]string) []string {
	out := append([]string{}, p.others...)
	for _, l := range lists {
		for _, h := range l {
			if !slices.Contains(out, h) {
				out = append(out, h)
			}
		}
	}
	slices.Sort(out)
	return out
}

// planAliases は独自ドメインの変更を決める。ほかの CDN が使っている独自ドメインは使えない。
// 独自ドメインは CDN を作ったあと（revision があるとき）にだけ足せる
func (u *ConsoleUsecaseImpl) planAliases(ctx context.Context, store gateway.ResourceStore, name, revision string, want []string) (aliasPlan, error) {
	var plan aliasPlan
	zone := u.d.APITarget.AliasZone
	files, err := store.List(ctx, gateway.KindCDN)
	if err != nil {
		return plan, storeErr(err)
	}
	var old []string
	for _, f := range files {
		aliases := service.AliasesInYAML(f.YAML, zone)
		if f.Name == name {
			old = aliases
			continue
		}
		for _, a := range aliases {
			if slices.Contains(want, a) {
				return plan, errs.New(errs.ErrorTypeDuplicate, fmt.Sprintf("%s は CDN %s が使っています", a, f.Name)).WithCode("host_taken")
			}
			plan.others = append(plan.others, a)
		}
	}
	for _, a := range want {
		if !slices.Contains(old, a) {
			plan.added = append(plan.added, a)
		}
	}
	for _, a := range old {
		if !slices.Contains(want, a) {
			plan.removed = append(plan.removed, a)
		}
	}
	if len(plan.added) > 0 {
		if revision == "" {
			return plan, errs.NewValidationError("aliases", "独自ドメインは、CDN を作ったあとに足してください").WithCode("invalid")
		}
		if u.customDomainZone() == "" {
			return plan, errs.NewValidationError("aliases", "この環境では独自ドメインを足せません（Cloudflare Access と DNS のトークンが要ります）").WithCode("invalid")
		}
	}
	return plan, nil
}

func (u *ConsoleUsecaseImpl) DeleteDistribution(ctx context.Context, in DeleteDistributionInput) (*DeleteDistributionOutput, error) {
	store, err := u.store()
	if err != nil {
		return nil, err
	}
	if !service.ValidName(in.Name) {
		return nil, storeErr(gateway.ErrResourceNotFound)
	}
	// 独自ドメインは、DNS を消してから Access から外す
	plan, err := u.planAliases(ctx, store, in.Name, in.Revision, nil)
	if err != nil {
		return nil, err
	}
	if err := store.Delete(ctx, gateway.KindCDN, in.Name, in.Revision, u.commitMessage(ctx, "delete", "cdn", in.Name)); err != nil {
		return nil, storeErr(err)
	}
	problems := []string{}
	for _, h := range append([]string{u.d.APITarget.Host(service.HostCDN, in.Name)}, plan.removed...) {
		if p := u.removeDNS(ctx, h); p != "" {
			problems = append(problems, p)
		}
	}
	if len(plan.removed) > 0 && u.d.Access != nil {
		if err := u.d.Access.SetHosts(ctx, plan.protect()); err != nil {
			problems = append(problems, "Access から外せませんでした（ログインは要るままです）: "+err.Error())
		}
	}
	cache := u.purgeHosts(ctx, append([]string{u.d.APITarget.Host(service.HostCDN, in.Name)}, plan.removed...))
	return &DeleteDistributionOutput{DnsProblem: strings.Join(problems, "・"), CacheProblem: cache}, nil
}
