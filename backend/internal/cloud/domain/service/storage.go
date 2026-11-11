package service

import (
	"reflect"
	"sort"
	"strconv"
	"strings"
)

// バケットと CDN の YAML で使う値
const (
	KindBucket = "bucket"
	KindCDN    = "cdn"
	// LabelBucket はバケットの ConfigMap に付けるバケット名（ストレージがこのラベルの ConfigMap を見てバケットを作る）
	LabelBucket = "cloud.taramanji.com/bucket"
	// CDN の HTTPRoute が API Gateway（cloud-gw）に渡すヘッダー
	HeaderBucket   = "X-Cloud-Bucket"
	HeaderCacheTTL = "X-Cloud-Cache-Ttl"
	HeaderSPA      = "X-Cloud-Spa"

	OriginBucket   = "bucket"
	OriginFunction = "function"
	// キャッシュさせる長さの上限（1 年）
	MaxCacheSeconds = int32(365 * 24 * 3600)
)

type k8sConfigMap struct {
	typeMeta `yaml:",inline"`
	Metadata objectMeta        `yaml:"metadata"`
	Data     map[string]string `yaml:"data,omitempty"`
}

// BucketObjectName はバケットの ConfigMap の名前（関数の名前とぶつからないように接頭辞を付ける）
func BucketObjectName(name string) string { return "bucket-" + name }

// PublicBucketCacheSeconds は公開バケットの配信に付ける Cache-Control: public, max-age（5 分）。
// 同じファイルは Cloudflare のエッジが返すので、Mac mini まで来ない
const PublicBucketCacheSeconds = 300

// BucketRouteName は公開バケットの HTTPRoute の名前。API・CDN の HTTPRoute（名前 = <名前>、. を含められない）とぶつからないよう . で区切る
func BucketRouteName(name string) string { return "bucket." + name }

// RenderBucketYAML はバケットを Kubernetes の YAML にする。ConfigMap 1 つ（中身はなく、あることがバケットの定義）。
// 公開するときは、<バケット>-storage-cloud.taramanji.com の全パスをこのバケットに向ける HTTPRoute を足す（読むだけ・ログインなし）
func RenderBucketYAML(name string, public bool, t APITarget) (string, error) {
	var c k8sConfigMap
	c.APIVersion, c.Kind = "v1", "ConfigMap"
	c.Metadata = objectMeta{Name: BucketObjectName(name), Labels: map[string]string{LabelKind: KindBucket, LabelBucket: name}}
	if !public {
		return encodeDocs(c)
	}
	var r k8sHTTPRoute
	r.APIVersion, r.Kind = "gateway.networking.k8s.io/v1", "HTTPRoute"
	r.Metadata = objectMeta{Name: BucketRouteName(name), Labels: map[string]string{LabelKind: KindBucket, LabelBucket: name}}
	r.Spec.ParentRefs = append(r.Spec.ParentRefs, struct {
		Name        string `yaml:"name"`
		Namespace   string `yaml:"namespace"`
		SectionName string `yaml:"sectionName"`
	}{Name: gatewayName, Namespace: gatewayNamespace, SectionName: gatewayListener})
	r.Spec.Hostnames = []string{t.Host(HostStorage, name)}
	var rule routeRule
	var m routeMatch
	m.Path.Type, m.Path.Value = "PathPrefix", "/"
	rule.Matches = []routeMatch{m}
	f := routeFilter{Type: "RequestHeaderModifier"}
	f.RequestHeaderModifier.Set = []headerValue{{Name: HeaderBucket, Value: name},
		{Name: HeaderCacheTTL, Value: strconv.Itoa(PublicBucketCacheSeconds)},
		{Name: HeaderSPA, Value: "false"}}
	// 関数を直接呼ばせない
	f.RequestHeaderModifier.Remove = []string{HeaderFunction}
	rule.Filters = []routeFilter{f}
	rule.BackendRefs = []backendRef{{Name: InvokerService, Namespace: t.InvokerNamespace, Port: InvokerPort}}
	r.Spec.Rules = []routeRule{rule}
	return encodeDocs(c, r)
}

// ParsedBucket は YAML から読み取ったバケット
type ParsedBucket struct {
	Public bool
}

// ParseBucketYAML はバケットの YAML が決まった形（ConfigMap 1 つ、公開なら HTTPRoute も 1 つ）であることを確かめる
func ParseBucketYAML(name, src string, t APITarget) (*ParsedBucket, error) {
	if !ValidName(name) {
		return nil, fieldErr("name", "名前は英小文字で始め、英小文字・数字・ハイフンで 40 文字までにしてください")
	}
	docs, err := parseDocs(src)
	if err != nil {
		return nil, err
	}
	for _, public := range []bool{false, true} {
		want, err := RenderBucketYAML(name, public, t)
		if err != nil {
			return nil, err
		}
		if wantDocs, _ := splitDocs(want); reflect.DeepEqual(docs, wantDocs) {
			return &ParsedBucket{Public: public}, nil
		}
	}
	return nil, fieldErr("yaml", "バケットの YAML は、ラベル %s: %s の付いた ConfigMap %s（公開するなら、%s を配る HTTPRoute %s も）だけにしてください",
		LabelBucket, name, BucketObjectName(name), t.Host(HostStorage, name), BucketRouteName(name))
}

// DistributionOrigin は、パスの前方一致ごとの元（CloudFront の behavior にあたる）。
// パスはそのまま元に渡る（取り除かない。/api/x なら関数にも /api/x が届く）
type DistributionOrigin struct {
	Path       string
	OriginType string
	Origin     string
	// CacheSeconds は Cache-Control: public, max-age の秒数。0 ならキャッシュさせない
	CacheSeconds int32
	// SPA はバケットが元のとき、ファイルがないパスに index.html を返す
	SPA bool
}

// DistributionSpec は CDN（CloudFront にあたるもの）: 公開するホスト名と、その元（バケットか関数）。
// 上の 4 つが既定の元（/）。Behaviors で、パスごとに別の元に送れる（長いパスが先に当たる）。
// キャッシュするのは Cloudflare のエッジで、ここでは Cache-Control を付けて長さを決める
type DistributionSpec struct {
	Name         string
	OriginType   string
	Origin       string
	CacheSeconds int32
	SPA          bool
	Behaviors    []DistributionOrigin
}

// MaxBehaviors は既定（/）のほかに足せるパスの数（HTTPRoute の rules は 16 まで）
const MaxBehaviors = MaxRoutes - 1

// Default は既定の元（/）
func (s DistributionSpec) Default() DistributionOrigin {
	return DistributionOrigin{Path: "/", OriginType: s.OriginType, Origin: s.Origin, CacheSeconds: s.CacheSeconds, SPA: s.SPA}
}

// Origins はパスごとの元と既定の元を、当てはめる順（長いパスが先、最後が /）に並べる
func (s DistributionSpec) Origins() []DistributionOrigin {
	return append(append([]DistributionOrigin{}, s.Normalize().Behaviors...), s.Default())
}

// Normalize はパスの前後の空白と末尾の / を落とし、長いパスが先に来るように並べる
func (s DistributionSpec) Normalize() DistributionSpec {
	b := make([]DistributionOrigin, len(s.Behaviors))
	for i, o := range s.Behaviors {
		p := strings.TrimSpace(o.Path)
		if len(p) > 1 {
			p = strings.TrimRight(p, "/")
		}
		o.Path, o.Origin = p, strings.TrimSpace(o.Origin)
		b[i] = o
	}
	sort.SliceStable(b, func(i, j int) bool {
		if len(b[i].Path) != len(b[j].Path) {
			return len(b[i].Path) > len(b[j].Path)
		}
		return b[i].Path < b[j].Path
	})
	s.Behaviors = b
	return s
}

func (o DistributionOrigin) validate(field, where string) error {
	if o.OriginType != OriginBucket && o.OriginType != OriginFunction {
		return fieldErr(field, "%s元はバケットか関数です", where)
	}
	if !ValidName(o.Origin) {
		return fieldErr(field, "%s元の%sを選んでください", where, map[string]string{OriginBucket: "バケット", OriginFunction: "関数"}[o.OriginType])
	}
	if o.CacheSeconds < 0 || o.CacheSeconds > MaxCacheSeconds {
		return fieldErr(field, "%sキャッシュの長さは 0〜%d 秒です", where, MaxCacheSeconds)
	}
	if o.SPA && o.OriginType != OriginBucket {
		return fieldErr(field, "%sindex.html を返す設定は、バケットが元のときだけ使えます", where)
	}
	return nil
}

func (s DistributionSpec) Validate() error {
	if !ValidName(s.Name) {
		return fieldErr("name", "名前は英小文字で始め、英小文字・数字・ハイフンで 40 文字までにしてください")
	}
	d := s.Default()
	// 既定の元のエラーは、今までどおりフォームの欄ごとに返す
	if d.OriginType != OriginBucket && d.OriginType != OriginFunction {
		return fieldErr("origin_type", "元はバケットか関数です")
	}
	if !ValidName(d.Origin) {
		return fieldErr("origin", "元の%sを選んでください", map[string]string{OriginBucket: "バケット", OriginFunction: "関数"}[d.OriginType])
	}
	if d.CacheSeconds < 0 || d.CacheSeconds > MaxCacheSeconds {
		return fieldErr("cache_seconds", "キャッシュの長さは 0〜%d 秒です", MaxCacheSeconds)
	}
	if d.SPA && d.OriginType != OriginBucket {
		return fieldErr("spa", "index.html を返す設定は、バケットが元のときだけ使えます")
	}
	if len(s.Behaviors) > MaxBehaviors {
		return fieldErr("behaviors", "パスごとの元は %d 個までです", MaxBehaviors)
	}
	seen := map[string]bool{}
	for _, o := range s.Behaviors {
		if o.Path == "/" {
			return fieldErr("behaviors", "/ は既定の元なので、パスごとの元には書かないでください")
		}
		if !pathRe.MatchString(o.Path) || strings.Contains(o.Path, "//") || strings.Contains(o.Path, "..") {
			return fieldErr("behaviors", "パス %q は / で始まる英数字と . _ ~ - / にしてください", o.Path)
		}
		if seen[o.Path] {
			return fieldErr("behaviors", "パス %q が重複しています", o.Path)
		}
		seen[o.Path] = true
		if err := o.validate("behaviors", "パス "+o.Path+" の"); err != nil {
			return err
		}
	}
	return nil
}

// Uses は、この CDN が元にしている名前（originType のもの。重複なし）
func (s DistributionSpec) Uses(originType string) []string {
	out := []string{}
	for _, o := range s.Origins() {
		if o.OriginType == originType && !containsString(out, o.Origin) {
			out = append(out, o.Origin)
		}
	}
	return out
}

// RenderDistributionYAML は定義を Kubernetes の YAML（HTTPRoute 1 つ）にする。
// パスごとに、元とキャッシュの長さをヘッダーに付けて API Gateway（cloud-gw）に送る（最後のルールが既定の /）
func RenderDistributionYAML(s DistributionSpec, t APITarget) (string, error) {
	var r k8sHTTPRoute
	r.APIVersion, r.Kind = "gateway.networking.k8s.io/v1", "HTTPRoute"
	r.Metadata = objectMeta{Name: s.Name, Labels: map[string]string{"app.kubernetes.io/name": s.Name, LabelKind: KindCDN}}
	r.Spec.ParentRefs = append(r.Spec.ParentRefs, struct {
		Name        string `yaml:"name"`
		Namespace   string `yaml:"namespace"`
		SectionName string `yaml:"sectionName"`
	}{Name: gatewayName, Namespace: gatewayNamespace, SectionName: gatewayListener})
	r.Spec.Hostnames = []string{t.Host(HostCDN, s.Name)}
	for _, o := range s.Origins() {
		var rule routeRule
		var m routeMatch
		m.Path.Type, m.Path.Value = "PathPrefix", o.Path
		rule.Matches = []routeMatch{m}
		f := routeFilter{Type: "RequestHeaderModifier"}
		// 3 つとも毎回 set する（付けないと、利用者が付けてきた値がそのまま通ってしまう）
		origin := headerValue{Name: HeaderFunction, Value: o.Origin}
		if o.OriginType == OriginBucket {
			origin.Name = HeaderBucket
		}
		f.RequestHeaderModifier.Set = []headerValue{origin,
			{Name: HeaderCacheTTL, Value: strconv.Itoa(int(o.CacheSeconds))},
			{Name: HeaderSPA, Value: strconv.FormatBool(o.SPA)}}
		// 元でない方のヘッダーは消す（利用者が X-Cloud-Function を付けて、関数を直接呼ぶのを防ぐ）
		other := HeaderBucket
		if o.OriginType == OriginBucket {
			other = HeaderFunction
		}
		f.RequestHeaderModifier.Remove = []string{other}
		rule.Filters = []routeFilter{f}
		rule.BackendRefs = []backendRef{{Name: InvokerService, Namespace: t.InvokerNamespace, Port: InvokerPort}}
		r.Spec.Rules = append(r.Spec.Rules, rule)
	}
	return encodeDocs(r)
}

// ParsedDistribution は YAML から読み取った CDN
type ParsedDistribution struct {
	Spec         DistributionSpec
	FormEditable bool
}

// ParseDistributionYAML は CDN の YAML を確かめて、定義を読み取る。
// 形が決まっているので、フォームの定義から作り直した YAML と同じものだけを通す
func ParseDistributionYAML(name, src string, t APITarget) (*ParsedDistribution, error) {
	docs, err := parseDocs(src)
	if err != nil {
		return nil, err
	}
	if err := checkObjects(name, docs, apiKinds, "HTTPRoute", noNamespace); err != nil {
		return nil, err
	}
	var r k8sHTTPRoute
	if n, err := decodeKind(src, "HTTPRoute", &r); err != nil || n != 1 {
		return nil, fieldErr("yaml", "HTTPRoute を 1 つだけ書いてください")
	}
	spec := DistributionSpec{Name: name}
	hasDefault := false
	for _, rule := range r.Spec.Rules {
		if len(rule.Matches) != 1 || len(rule.Filters) != 1 {
			continue
		}
		o := DistributionOrigin{Path: rule.Matches[0].Path.Value}
		for _, h := range rule.Filters[0].RequestHeaderModifier.Set {
			switch {
			case strings.EqualFold(h.Name, HeaderBucket):
				o.OriginType, o.Origin = OriginBucket, h.Value
			case strings.EqualFold(h.Name, HeaderFunction):
				o.OriginType, o.Origin = OriginFunction, h.Value
			case strings.EqualFold(h.Name, HeaderCacheTTL):
				n, _ := strconv.Atoi(h.Value)
				o.CacheSeconds = int32(n)
			case strings.EqualFold(h.Name, HeaderSPA):
				o.SPA = h.Value == "true"
			}
		}
		if o.Path == "/" && !hasDefault {
			hasDefault = true
			spec.OriginType, spec.Origin, spec.CacheSeconds, spec.SPA = o.OriginType, o.Origin, o.CacheSeconds, o.SPA
			continue
		}
		spec.Behaviors = append(spec.Behaviors, o)
	}
	if !hasDefault {
		return nil, fieldErr("yaml", "既定の元（パス / のルール）を 1 つ書いてください")
	}
	spec = spec.Normalize()
	if err := spec.Validate(); err != nil {
		return nil, fieldErr("yaml", "%v", err)
	}
	again, err := RenderDistributionYAML(spec, t)
	if err != nil {
		return nil, err
	}
	if want, _ := splitDocs(again); !reflect.DeepEqual(docs, want) {
		return nil, fieldErr("yaml", "CDN の YAML は、コンソールが作る形（ホスト名 %s・パスごとに cloud-gw へ・ヘッダー 3 つ・長いパスから順で最後が /）から変えられません", t.Host(HostCDN, name))
	}
	return &ParsedDistribution{Spec: spec, FormEditable: true}, nil
}
