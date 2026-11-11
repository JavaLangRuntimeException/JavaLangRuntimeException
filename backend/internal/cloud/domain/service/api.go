package service

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"reflect"
	"regexp"
	"sort"
	"strings"
)

// apiOnlyHeaders は API の設定（認証・CORS）を API Gateway に伝えるヘッダー。設定していないルートでは必ず消す
var apiOnlyHeaders = []string{HeaderAuth, HeaderAPIKeys, HeaderCORS}

// cloud の Gateway（deploy/cloud/platform/gateway.yaml）と、関数を呼び出す API Gateway（cloud-gw）の Service
const (
	gatewayName      = "cloud"
	gatewayNamespace = "taramanji-cloud-gateway"
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
	// Auth は認証（AuthNone / AuthAPIKey）。API キーなら、API Gateway が x-api-key を確かめてから関数を起こす
	Auth string
	// Keys は API キー（ハッシュだけを持つ。キーそのものは作ったときに 1 回だけ見せる）
	Keys []APIKey
	// CORSOrigins はブラウザから呼んでよいオリジン（https://x-storage-cloud.taramanji.com など。* はどこからでも）。
	// 空なら API Gateway は CORS に答えない（関数が自分で答える）
	CORSOrigins []string
}

// API の認証
const (
	AuthNone   = "none"
	AuthAPIKey = "api_key"
	// MaxAPIKeys は 1 つの API に作れるキーの数（入れ替えのあいだ 2 つ以上を並べられるように）
	MaxAPIKeys = 5
	// MaxCORSOrigins は許すオリジンの数
	MaxCORSOrigins = 10
	// APIKeyPrefix は API キーの頭（見分けやすくするため。GitHub の ghp_ などと同じ）
	APIKeyPrefix = "tck_"
	// AnnotationAPIKeys は API キーの名前・頭・ハッシュ（JSON）。HTTPRoute の注釈に置く（ハッシュなので git に残してよい）
	AnnotationAPIKeys = "cloud.taramanji.com/api-keys"
)

// APIKey は API キー 1 つ。Hash はキー全体の SHA-256（16 進）。Prefix は画面で見分けるための頭（tck_ と 8 文字）
type APIKey struct {
	Name   string `json:"name"`
	Prefix string `json:"prefix"`
	Hash   string `json:"hash"`
}

var (
	keyHashRe   = regexp.MustCompile(`^[0-9a-f]{64}$`)
	keyPrefixRe = regexp.MustCompile(`^tck_[0-9a-f]{8}$`)
	originRe    = regexp.MustCompile(`^https?://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:[0-9]{1,5})?$`)
)

// NewAPIKey は新しい API キーを作る（160 ビットの乱数）。返したキーは保存しない（ハッシュだけを YAML に残す）
func NewAPIKey(name string) (key string, meta APIKey, err error) {
	b := make([]byte, 20)
	if _, err := rand.Read(b); err != nil {
		return "", APIKey{}, err
	}
	key = APIKeyPrefix + hex.EncodeToString(b)
	return key, APIKey{Name: name, Prefix: key[:len(APIKeyPrefix)+8], Hash: HashAPIKey(key)}, nil
}

// HashAPIKey は API キーの SHA-256（16 進）。キーは 160 ビットの乱数なので、ハッシュから戻すことはできない
func HashAPIKey(key string) string {
	sum := sha256.Sum256([]byte(key))
	return hex.EncodeToString(sum[:])
}

// MatchAPIKey は key が、ヘッダー X-Cloud-Api-Keys（"<名前>=<ハッシュ>,..."）のどれかに当たるかを調べ、当たったキーの名前を返す
func MatchAPIKey(header, key string) (string, bool) {
	if key == "" {
		return "", false
	}
	got := []byte(HashAPIKey(key))
	name, found := "", false
	for _, entry := range strings.Split(header, ",") {
		n, h, ok := strings.Cut(strings.TrimSpace(entry), "=")
		// 全部を比べる（どこで当たったかで時間が変わらないように）
		if ok && subtle.ConstantTimeCompare(got, []byte(h)) == 1 {
			name, found = n, true
		}
	}
	return name, found
}

// NormalizeOrigin はオリジンを小文字にし、末尾の / を落とす
func NormalizeOrigin(o string) string {
	return strings.TrimRight(strings.ToLower(strings.TrimSpace(o)), "/")
}

// HostOf は公開ホスト名（<名前> + 接尾辞）
func HostOf(name, hostSuffix string) string { return name + hostSuffix }

// 公開ホスト名のサービスの印。<名前>-<印>-cloud.taramanji.com のように、サービスごとにホスト名を分ける。
// 入口の守り方（Cloudflare Access のログインの有無）をホスト名のワイルドカードで分けられるようにするため:
//   - cdn:     CDN（ログインあり。*-cdn-cloud.taramanji.com を Access で守る）
//   - apigw:   API Gateway（ログインなし。認証は API キーか関数）
//   - storage: 公開バケット（ログインなし。公開をオンにしたバケットだけ）
//
// 印が違えば、名前が何であってもホスト名はぶつからない（末尾が -cdn・-apigw・-storage のどれかに決まる）
const (
	HostCDN     = "cdn"
	HostAPI     = "apigw"
	HostStorage = "storage"
)

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
	if s.Auth == "" {
		s.Auth = AuthNone
	}
	origins := []string{}
	for _, o := range s.CORSOrigins {
		if o = NormalizeOrigin(o); o != "" && !containsString(origins, o) {
			origins = append(origins, o)
		}
	}
	sort.Strings(origins)
	s.CORSOrigins = origins
	keys := append([]APIKey{}, s.Keys...)
	sort.SliceStable(keys, func(i, j int) bool { return keys[i].Name < keys[j].Name })
	s.Keys = keys
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
	if s.Auth != AuthNone && s.Auth != AuthAPIKey {
		return fieldErr("auth", "認証は「なし」か「API キー」です")
	}
	if len(s.Keys) > MaxAPIKeys {
		return fieldErr("keys", "API キーは %d 個までです", MaxAPIKeys)
	}
	names := map[string]bool{}
	for _, k := range s.Keys {
		if !ValidName(k.Name) {
			return fieldErr("keys", "API キーの名前は英小文字で始め、英小文字・数字・ハイフンで 40 文字までにしてください")
		}
		if names[k.Name] {
			return fieldErr("keys", "API キーの名前 %q が重複しています", k.Name)
		}
		names[k.Name] = true
		if !keyHashRe.MatchString(k.Hash) || !keyPrefixRe.MatchString(k.Prefix) {
			return fieldErr("keys", "API キー %q のハッシュか頭が正しくありません", k.Name)
		}
	}
	if len(s.CORSOrigins) > MaxCORSOrigins {
		return fieldErr("cors_origins", "CORS で許すオリジンは %d 個までです", MaxCORSOrigins)
	}
	for _, o := range s.CORSOrigins {
		if o != "*" && !originRe.MatchString(o) {
			return fieldErr("cors_origins", "オリジン %q は https://example.com の形（パスなし）か * にしてください", o)
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
		Set    []headerValue `yaml:"set"`
		Remove []string      `yaml:"remove,omitempty"`
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
	// HostSuffix は共通の接尾辞 "-cloud.taramanji.com" など。実際のホスト名は Host で作る
	HostSuffix string
	// InvokerNamespace は API Gateway（cloud-gw）がいる namespace（cloud / taramanji-cloud-stg / taramanji-cloud-dev）
	InvokerNamespace string
}

// Suffix はサービスのホスト名の接尾辞（"-apigw-cloud.taramanji.com" など）
func (t APITarget) Suffix(kind string) string { return "-" + kind + t.HostSuffix }

// Host はサービスの公開ホスト名（<名前>-apigw-cloud.taramanji.com など）
func (t APITarget) Host(kind, name string) string { return HostOf(name, t.Suffix(kind)) }

// RenderAPIYAML は定義を Kubernetes の YAML（HTTPRoute 1 つ）にする
func RenderAPIYAML(s APISpec, t APITarget) (string, error) {
	var r k8sHTTPRoute
	r.APIVersion, r.Kind = "gateway.networking.k8s.io/v1", "HTTPRoute"
	r.Metadata = objectMeta{Name: s.Name, Labels: map[string]string{"app.kubernetes.io/name": s.Name, LabelKind: KindAPI}}
	if len(s.Keys) > 0 {
		b, err := json.Marshal(s.Keys)
		if err != nil {
			return "", err
		}
		r.Metadata.Annotations = map[string]string{AnnotationAPIKeys: string(b)}
	}
	set, remove := apiHeaders(s)
	r.Spec.ParentRefs = append(r.Spec.ParentRefs, struct {
		Name        string `yaml:"name"`
		Namespace   string `yaml:"namespace"`
		SectionName string `yaml:"sectionName"`
	}{Name: gatewayName, Namespace: gatewayNamespace, SectionName: gatewayListener})
	r.Spec.Hostnames = []string{t.Host(HostAPI, s.Name)}
	for _, route := range s.Routes {
		var rule routeRule
		var m routeMatch
		m.Path.Type, m.Path.Value = "PathPrefix", route.Path
		rule.Matches = []routeMatch{m}
		// set は利用者が付けてきた同じ名前のヘッダーを上書きするので、渡し先は偽れない
		f := routeFilter{Type: "RequestHeaderModifier"}
		f.RequestHeaderModifier.Set = append([]headerValue{{Name: HeaderFunction, Value: route.Function}}, set...)
		// CDN 用のヘッダーを利用者が付けてきても、API ではバケットを読ませない・キャッシュの長さを決めさせない。
		// 認証・CORS のヘッダーも、設定していなければ消す（利用者が付けてきた値を使わせない）
		f.RequestHeaderModifier.Remove = append([]string{HeaderBucket, HeaderCacheTTL, HeaderSPA}, remove...)
		rule.Filters = []routeFilter{f}
		rule.BackendRefs = []backendRef{{Name: InvokerService, Namespace: t.InvokerNamespace, Port: InvokerPort}}
		r.Spec.Rules = append(r.Spec.Rules, rule)
	}
	return encodeDocs(r)
}

// apiHeaders は、認証・CORS の設定を API Gateway に伝えるヘッダー（set）と、設定していないので消すヘッダー（remove）
//   - X-Cloud-Auth: api_key（API キーのときだけ）
//   - X-Cloud-Api-Keys: <名前>=<ハッシュ>,...（キーがなければ "-"。どのキーも当たらない）
//   - X-Cloud-Cors: 許すオリジンを空白で区切ったもの
func apiHeaders(s APISpec) (set []headerValue, remove []string) {
	if s.Auth == AuthAPIKey {
		entries := []string{}
		for _, k := range s.Keys {
			entries = append(entries, k.Name+"="+k.Hash)
		}
		value := strings.Join(entries, ",")
		if value == "" {
			value = "-"
		}
		set = append(set, headerValue{Name: HeaderAuth, Value: AuthAPIKey}, headerValue{Name: HeaderAPIKeys, Value: value})
	} else {
		remove = append(remove, HeaderAuth, HeaderAPIKeys)
	}
	if len(s.CORSOrigins) > 0 {
		set = append(set, headerValue{Name: HeaderCORS, Value: strings.Join(s.CORSOrigins, " ")})
	} else {
		remove = append(remove, HeaderCORS)
	}
	return set, remove
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
	if err := checkObjects(name, docs, apiKinds, "HTTPRoute", noNamespace); err != nil {
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
	host := t.Host(HostAPI, name)
	if len(r.Spec.Hostnames) != 1 || r.Spec.Hostnames[0] != host {
		return nil, fieldErr("yaml", "hostnames は %s だけにしてください", host)
	}
	if len(r.Spec.ParentRefs) != 1 || r.Spec.ParentRefs[0].Name != gatewayName || r.Spec.ParentRefs[0].Namespace != gatewayNamespace {
		return nil, fieldErr("yaml", "parentRefs は %s/%s だけにしてください", gatewayNamespace, gatewayName)
	}
	spec := APISpec{Name: name, Auth: AuthNone}
	if raw := r.Metadata.Annotations[AnnotationAPIKeys]; raw != "" {
		if err := json.Unmarshal([]byte(raw), &spec.Keys); err != nil {
			return nil, fieldErr("yaml", "注釈 %s は API キーの JSON の配列にしてください", AnnotationAPIKeys)
		}
	}
	// 認証・CORS はどのルートも同じ（1 つ目のルートで決め、ほかが違えば通さない）
	var ruleAuth, ruleKeys, ruleCORS []string
	for _, rule := range r.Spec.Rules {
		if len(rule.BackendRefs) != 1 || rule.BackendRefs[0].Name != InvokerService || rule.BackendRefs[0].Namespace != t.InvokerNamespace || rule.BackendRefs[0].Port != InvokerPort {
			return nil, fieldErr("yaml", "backendRefs は API Gateway（%s/%s:%d）だけにしてください", t.InvokerNamespace, InvokerService, InvokerPort)
		}
		fn, auth, keys, cors := "", "", "", ""
		for _, f := range rule.Filters {
			for _, h := range f.RequestHeaderModifier.Set {
				if f.Type != "RequestHeaderModifier" {
					continue
				}
				switch {
				case strings.EqualFold(h.Name, HeaderFunction):
					fn = h.Value
				case strings.EqualFold(h.Name, HeaderAuth):
					auth = h.Value
				case strings.EqualFold(h.Name, HeaderAPIKeys):
					keys = h.Value
				case strings.EqualFold(h.Name, HeaderCORS):
					cors = h.Value
				}
			}
		}
		ruleAuth, ruleKeys, ruleCORS = append(ruleAuth, auth), append(ruleKeys, keys), append(ruleCORS, cors)
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
	for i := 1; i < len(ruleAuth); i++ {
		if ruleAuth[i] != ruleAuth[0] || ruleKeys[i] != ruleKeys[0] || ruleCORS[i] != ruleCORS[0] {
			return nil, fieldErr("yaml", "%s・%s・%s は、どのルートにも同じ値を set してください", HeaderAuth, HeaderAPIKeys, HeaderCORS)
		}
	}
	if len(ruleAuth) > 0 {
		switch ruleAuth[0] {
		case "":
		case AuthAPIKey:
			spec.Auth = AuthAPIKey
			// ヘッダーのキー（API Gateway が確かめるもの）と、注釈のキー（画面に出すもの）がそろっていること
			want := []string{}
			for _, k := range spec.Keys {
				want = append(want, k.Name+"="+k.Hash)
			}
			got := ruleKeys[0]
			if got == "-" {
				got = ""
			}
			if strings.Join(want, ",") != got && !sameSet(want, strings.Split(got, ",")) {
				return nil, fieldErr("yaml", "%s と注釈 %s の API キーがそろっていません", HeaderAPIKeys, AnnotationAPIKeys)
			}
		default:
			return nil, fieldErr("yaml", "%s は %s だけにしてください", HeaderAuth, AuthAPIKey)
		}
		spec.CORSOrigins = strings.Fields(ruleCORS[0])
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

// noNamespace は、namespace を書かない（環境の共有の namespace に入る）リソースの決まり
func noNamespace(string, string) string { return "" }

// sameSet は a と b が、並びを除いて同じか
func sameSet(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	x, y := append([]string{}, a...), append([]string{}, b...)
	sort.Strings(x)
	sort.Strings(y)
	return reflect.DeepEqual(x, y)
}
