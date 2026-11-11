package service

import (
	"reflect"
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
	Metadata objectMeta `yaml:"metadata"`
}

// BucketObjectName はバケットの ConfigMap の名前（関数の名前とぶつからないように接頭辞を付ける）
func BucketObjectName(name string) string { return "bucket-" + name }

// RenderBucketYAML はバケットを Kubernetes の YAML（ConfigMap 1 つ）にする。中身はなく、あることがバケットの定義
func RenderBucketYAML(name string) (string, error) {
	var c k8sConfigMap
	c.APIVersion, c.Kind = "v1", "ConfigMap"
	c.Metadata = objectMeta{Name: BucketObjectName(name), Labels: map[string]string{LabelKind: KindBucket, LabelBucket: name}}
	return encodeDocs(c)
}

// ParseBucketYAML はバケットの YAML が、決まった形の ConfigMap 1 つであることを確かめる
func ParseBucketYAML(name, src string) error {
	if !ValidName(name) {
		return fieldErr("name", "名前は英小文字で始め、英小文字・数字・ハイフンで 40 文字までにしてください")
	}
	docs, err := parseDocs(src)
	if err != nil {
		return err
	}
	want, _ := RenderBucketYAML(name)
	wantDocs, _ := splitDocs(want)
	if !reflect.DeepEqual(docs, wantDocs) {
		return fieldErr("yaml", "バケットの YAML は、ラベル %s: %s の付いた ConfigMap %s だけにしてください", LabelBucket, name, BucketObjectName(name))
	}
	return nil
}

// DistributionSpec は CDN（CloudFront にあたるもの）: 公開するホスト名と、その元（バケットか関数）。
// キャッシュするのは Cloudflare のエッジで、ここでは Cache-Control を付けて長さを決める
type DistributionSpec struct {
	Name       string
	OriginType string
	Origin     string
	// CacheSeconds は Cache-Control: public, max-age の秒数。0 ならキャッシュさせない
	CacheSeconds int32
	// SPA はバケットが元のとき、ファイルがないパスに index.html を返す
	SPA bool
}

func (s DistributionSpec) Validate() error {
	if !ValidName(s.Name) {
		return fieldErr("name", "名前は英小文字で始め、英小文字・数字・ハイフンで 40 文字までにしてください")
	}
	if s.OriginType != OriginBucket && s.OriginType != OriginFunction {
		return fieldErr("origin_type", "元はバケットか関数です")
	}
	if !ValidName(s.Origin) {
		return fieldErr("origin", "元の%sを選んでください", map[string]string{OriginBucket: "バケット", OriginFunction: "関数"}[s.OriginType])
	}
	if s.CacheSeconds < 0 || s.CacheSeconds > MaxCacheSeconds {
		return fieldErr("cache_seconds", "キャッシュの長さは 0〜%d 秒です", MaxCacheSeconds)
	}
	if s.SPA && s.OriginType != OriginBucket {
		return fieldErr("spa", "index.html を返す設定は、バケットが元のときだけ使えます")
	}
	return nil
}

// RenderDistributionYAML は定義を Kubernetes の YAML（HTTPRoute 1 つ）にする。
// 全部のパスを、元とキャッシュの長さをヘッダーに付けて API Gateway（cloud-gw）に送る
func RenderDistributionYAML(s DistributionSpec, t APITarget) (string, error) {
	var r k8sHTTPRoute
	r.APIVersion, r.Kind = "gateway.networking.k8s.io/v1", "HTTPRoute"
	r.Metadata = objectMeta{Name: s.Name, Labels: map[string]string{"app.kubernetes.io/name": s.Name, LabelKind: KindCDN}}
	r.Spec.ParentRefs = append(r.Spec.ParentRefs, struct {
		Name        string `yaml:"name"`
		Namespace   string `yaml:"namespace"`
		SectionName string `yaml:"sectionName"`
	}{Name: gatewayName, Namespace: gatewayNamespace, SectionName: gatewayListener})
	r.Spec.Hostnames = []string{HostOf(s.Name, t.HostSuffix)}
	var rule routeRule
	var m routeMatch
	m.Path.Type, m.Path.Value = "PathPrefix", "/"
	rule.Matches = []routeMatch{m}
	f := routeFilter{Type: "RequestHeaderModifier"}
	// 3 つとも毎回 set する（付けないと、利用者が付けてきた値がそのまま通ってしまう）
	origin := headerValue{Name: HeaderFunction, Value: s.Origin}
	if s.OriginType == OriginBucket {
		origin.Name = HeaderBucket
	}
	f.RequestHeaderModifier.Set = []headerValue{origin,
		{Name: HeaderCacheTTL, Value: strconv.Itoa(int(s.CacheSeconds))},
		{Name: HeaderSPA, Value: strconv.FormatBool(s.SPA)}}
	// 元でない方のヘッダーは消す（利用者が X-Cloud-Function を付けて、関数を直接呼ぶのを防ぐ）
	other := HeaderBucket
	if s.OriginType == OriginBucket {
		other = HeaderFunction
	}
	f.RequestHeaderModifier.Remove = []string{other}
	rule.Filters = []routeFilter{f}
	rule.BackendRefs = []backendRef{{Name: InvokerService, Namespace: t.InvokerNamespace, Port: InvokerPort}}
	r.Spec.Rules = []routeRule{rule}
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
	if err := checkObjects(name, docs, apiKinds, "HTTPRoute"); err != nil {
		return nil, err
	}
	var r k8sHTTPRoute
	if n, err := decodeKind(src, "HTTPRoute", &r); err != nil || n != 1 {
		return nil, fieldErr("yaml", "HTTPRoute を 1 つだけ書いてください")
	}
	spec := DistributionSpec{Name: name}
	if len(r.Spec.Rules) == 1 && len(r.Spec.Rules[0].Filters) == 1 {
		for _, h := range r.Spec.Rules[0].Filters[0].RequestHeaderModifier.Set {
			switch {
			case strings.EqualFold(h.Name, HeaderBucket):
				spec.OriginType, spec.Origin = OriginBucket, h.Value
			case strings.EqualFold(h.Name, HeaderFunction):
				spec.OriginType, spec.Origin = OriginFunction, h.Value
			case strings.EqualFold(h.Name, HeaderCacheTTL):
				n, _ := strconv.Atoi(h.Value)
				spec.CacheSeconds = int32(n)
			case strings.EqualFold(h.Name, HeaderSPA):
				spec.SPA = h.Value == "true"
			}
		}
	}
	if err := spec.Validate(); err != nil {
		return nil, fieldErr("yaml", "%v", err)
	}
	again, err := RenderDistributionYAML(spec, t)
	if err != nil {
		return nil, err
	}
	if want, _ := splitDocs(again); !reflect.DeepEqual(docs, want) {
		return nil, fieldErr("yaml", "CDN の YAML は、コンソールが作る形（ホスト名 %s・全パスを cloud-gw へ・ヘッダー 3 つ）から変えられません", HostOf(name, t.HostSuffix))
	}
	return &ParsedDistribution{Spec: spec, FormEditable: true}, nil
}
