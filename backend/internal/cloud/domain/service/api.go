package service

import (
	"reflect"
	"regexp"
	"sort"
	"strings"
)

// cloud の Gateway（deploy/cloud/platform/gateway.yaml）と、関数を呼び出す API Gateway（cloud-gw）の Service
const (
	gatewayName      = "cloud"
	gatewayNamespace = "cloud-gateway"
	gatewayListener  = "http"
	InvokerService   = "cloud-gw"
	InvokerPort      = int32(8080)
	// 1 つの API のルートの上限（HTTPRoute の rules は 16 まで）
	MaxRoutes = 16
)

var pathRe = regexp.MustCompile(`^/[A-Za-z0-9._~/-]*$`)

// APIRoute はパスの前方一致と、渡し先の関数
type APIRoute struct {
	Path     string
	Function string
}

// APISpec は公開するホスト名（<名前> + 接尾辞）と、パスごとの渡し先。
// Kubernetes の YAML では HTTPRoute 1 つ。各ルールが X-Cloud-Function を付けて API Gateway（cloud-gw）に送り、
// API Gateway がその関数を起こして渡す
type APISpec struct {
	Name   string
	Routes []APIRoute
}

// HostOf は公開ホスト名（<名前> + "-cloud.taramanji.com" など）
func HostOf(name, hostSuffix string) string { return name + hostSuffix }

// Normalize はパスの末尾の / を落とし、長いパスが先に来るように並べる
func (s APISpec) Normalize() APISpec {
	routes := make([]APIRoute, len(s.Routes))
	for i, r := range s.Routes {
		p := strings.TrimSpace(r.Path)
		if len(p) > 1 {
			p = strings.TrimRight(p, "/")
		}
		routes[i] = APIRoute{Path: p, Function: strings.TrimSpace(r.Function)}
	}
	sort.SliceStable(routes, func(i, j int) bool {
		if len(routes[i].Path) != len(routes[j].Path) {
			return len(routes[i].Path) > len(routes[j].Path)
		}
		return routes[i].Path < routes[j].Path
	})
	s.Routes = routes
	return s
}

func (s APISpec) Validate() error {
	if !ValidName(s.Name) {
		return fieldErr("name", "名前は英小文字で始め、英小文字・数字・ハイフンで 40 文字までにしてください")
	}
	if len(s.Routes) == 0 || len(s.Routes) > MaxRoutes {
		return fieldErr("routes", "ルートは 1〜%d 個です", MaxRoutes)
	}
	seen := map[string]bool{}
	for _, r := range s.Routes {
		if !pathRe.MatchString(r.Path) || strings.Contains(r.Path, "//") || strings.Contains(r.Path, "..") {
			return fieldErr("routes", "パス %q は / で始まる英数字と . _ ~ - / にしてください", r.Path)
		}
		if seen[r.Path] {
			return fieldErr("routes", "パス %q が重複しています", r.Path)
		}
		seen[r.Path] = true
		if !ValidName(r.Function) {
			return fieldErr("routes", "パス %q の渡し先の関数を選んでください", r.Path)
		}
	}
	return nil
}

// Functions はこの API が渡している関数の名前（重複なし）
func (s APISpec) Functions() []string {
	out := []string{}
	for _, r := range s.Routes {
		if !containsString(out, r.Function) {
			out = append(out, r.Function)
		}
	}
	return out
}

func containsString(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

type headerValue struct {
	Name  string `yaml:"name"`
	Value string `yaml:"value"`
}

type routeFilter struct {
	Type                  string `yaml:"type"`
	RequestHeaderModifier struct {
		Set []headerValue `yaml:"set"`
	} `yaml:"requestHeaderModifier"`
}

type routeMatch struct {
	Path struct {
		Type  string `yaml:"type"`
		Value string `yaml:"value"`
	} `yaml:"path"`
}

type backendRef struct {
	Name      string `yaml:"name"`
	Namespace string `yaml:"namespace"`
	Port      int32  `yaml:"port"`
}

type routeRule struct {
	Matches     []routeMatch  `yaml:"matches"`
	Filters     []routeFilter `yaml:"filters"`
	BackendRefs []backendRef  `yaml:"backendRefs"`
}

type k8sHTTPRoute struct {
	typeMeta `yaml:",inline"`
	Metadata objectMeta `yaml:"metadata"`
	Spec     struct {
		ParentRefs []struct {
			Name        string `yaml:"name"`
			Namespace   string `yaml:"namespace"`
			SectionName string `yaml:"sectionName"`
		} `yaml:"parentRefs"`
		Hostnames []string    `yaml:"hostnames"`
		Rules     []routeRule `yaml:"rules"`
	} `yaml:"spec"`
}

// APITarget は API の YAML を作る・確かめるときの、この環境の値
type APITarget struct {
	// HostSuffix は "-cloud.taramanji.com" など
	HostSuffix string
	// InvokerNamespace は API Gateway（cloud-gw）がいる namespace（cloud / cloud-stg / cloud-dev）
	InvokerNamespace string
}

// RenderAPIYAML は定義を Kubernetes の YAML（HTTPRoute 1 つ）にする
func RenderAPIYAML(s APISpec, t APITarget) (string, error) {
	var r k8sHTTPRoute
	r.APIVersion, r.Kind = "gateway.networking.k8s.io/v1", "HTTPRoute"
	r.Metadata = objectMeta{Name: s.Name, Labels: map[string]string{"app.kubernetes.io/name": s.Name, LabelKind: KindAPI}}
	r.Spec.ParentRefs = append(r.Spec.ParentRefs, struct {
		Name        string `yaml:"name"`
		Namespace   string `yaml:"namespace"`
		SectionName string `yaml:"sectionName"`
	}{Name: gatewayName, Namespace: gatewayNamespace, SectionName: gatewayListener})
	r.Spec.Hostnames = []string{HostOf(s.Name, t.HostSuffix)}
	for _, route := range s.Routes {
		var rule routeRule
		var m routeMatch
		m.Path.Type, m.Path.Value = "PathPrefix", route.Path
		rule.Matches = []routeMatch{m}
		// set は利用者が付けてきた同じ名前のヘッダーを上書きするので、渡し先は偽れない
		f := routeFilter{Type: "RequestHeaderModifier"}
		f.RequestHeaderModifier.Set = []headerValue{{Name: HeaderFunction, Value: route.Function}}
		rule.Filters = []routeFilter{f}
		rule.BackendRefs = []backendRef{{Name: InvokerService, Namespace: t.InvokerNamespace, Port: InvokerPort}}
		r.Spec.Rules = append(r.Spec.Rules, rule)
	}
	return encodeDocs(r)
}

// ParsedAPI は YAML から読み取った API
type ParsedAPI struct {
	Spec         APISpec
	FormEditable bool
}

var apiKinds = map[string]bool{"HTTPRoute": true}

// ParseAPIYAML は API 1 つの YAML を確かめて、定義を読み取る。
// ホスト名はこの API のものだけ、送り先は API Gateway だけ（ほかの Service やよそのホスト名には向けられない）
func ParseAPIYAML(name, src string, t APITarget) (*ParsedAPI, error) {
	docs, err := parseDocs(src)
	if err != nil {
		return nil, err
	}
	if err := checkObjects(name, docs, apiKinds, "HTTPRoute"); err != nil {
		return nil, err
	}
	var r k8sHTTPRoute
	n, err := decodeKind(src, "HTTPRoute", &r)
	if err != nil {
		return nil, err
	}
	if n != 1 || r.Metadata.Name != name {
		return nil, fieldErr("yaml", "HTTPRoute は %q という名前で 1 つだけ書いてください", name)
	}
	host := HostOf(name, t.HostSuffix)
	if len(r.Spec.Hostnames) != 1 || r.Spec.Hostnames[0] != host {
		return nil, fieldErr("yaml", "hostnames は %s だけにしてください", host)
	}
	if len(r.Spec.ParentRefs) != 1 || r.Spec.ParentRefs[0].Name != gatewayName || r.Spec.ParentRefs[0].Namespace != gatewayNamespace {
		return nil, fieldErr("yaml", "parentRefs は %s/%s だけにしてください", gatewayNamespace, gatewayName)
	}
	spec := APISpec{Name: name}
	for _, rule := range r.Spec.Rules {
		if len(rule.BackendRefs) != 1 || rule.BackendRefs[0].Name != InvokerService || rule.BackendRefs[0].Namespace != t.InvokerNamespace || rule.BackendRefs[0].Port != InvokerPort {
			return nil, fieldErr("yaml", "backendRefs は API Gateway（%s/%s:%d）だけにしてください", t.InvokerNamespace, InvokerService, InvokerPort)
		}
		fn := ""
		for _, f := range rule.Filters {
			for _, h := range f.RequestHeaderModifier.Set {
				if f.Type == "RequestHeaderModifier" && strings.EqualFold(h.Name, HeaderFunction) {
					fn = h.Value
				}
			}
		}
		if !ValidName(fn) {
			return nil, fieldErr("yaml", "各ルールに RequestHeaderModifier で %s（渡し先の関数名）を set してください", HeaderFunction)
		}
		if len(rule.Matches) == 0 {
			spec.Routes = append(spec.Routes, APIRoute{Path: "/", Function: fn})
		}
		for _, m := range rule.Matches {
			spec.Routes = append(spec.Routes, APIRoute{Path: m.Path.Value, Function: fn})
		}
	}
	spec = spec.Normalize()
	if err := spec.Validate(); err != nil {
		return nil, fieldErr("yaml", "%v", err)
	}
	editable := false
	if again, err := RenderAPIYAML(spec, t); err == nil {
		if want, err := splitDocs(again); err == nil {
			editable = reflect.DeepEqual(docs, want)
		}
	}
	return &ParsedAPI{Spec: spec, FormEditable: editable}, nil
}
