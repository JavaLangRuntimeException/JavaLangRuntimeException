package service

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"maps"
	"reflect"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"go.yaml.in/yaml/v3"
)

// アプリの Deployment に付けるラベル・注釈。YAML を手で書くときも同じものを付ければ、コンソールが同じように読む
const (
	LabelApp = "cloud.taramanji.com/app"
	// LabelKind はリソースの種類（function / api）
	LabelKind         = "cloud.taramanji.com/kind"
	KindFunction      = "function"
	KindAPI           = "api"
	LabelInstanceType = "cloud.taramanji.com/instance-type"
	// 用意した監視（AlertPresets の ID）と通知先（NotifyChannels）。どちらもカンマ区切り
	AnnotationAlerts = "cloud.taramanji.com/alerts"
	AnnotationNotify = "cloud.taramanji.com/notify"
	// API Gateway が書く、最後にリクエストを受けた時刻（RFC 3339）。しばらく来なければ 0 台に戻す目安にする
	AnnotationLastRequest = "cloud.taramanji.com/last-request"
	// 関数を呼ぶとき、Envoy（HTTPRoute の RequestHeaderModifier）が API Gateway に渡す関数名
	HeaderFunction = "X-Cloud-Function"
	// アプリ用 namespace は、この優先度が付いていない Pod を作れない（ResourceQuota require-cloud-priority）
	PriorityClass = "cloud-workload"
	// 1 つのアプリの YAML の上限（GitHub の Contents API は 1 MB までだが、手で読める大きさに抑える）
	MaxYAMLBytes = 64 << 10
)

// 通知先。Datadog のモニターは必ず作られる（Datadog の画面に出る）ので、ここで選ぶのはその先の送り先だけ
const (
	NotifyMail    = "mail"
	NotifyDiscord = "discord"
)

var NotifyChannels = []string{NotifyMail, NotifyDiscord}

var (
	// 名前は URL（<名前>-cloud.taramanji.com）とファイル名になる。DNS のラベルで、長さは接尾辞の分を空けておく
	appNameRe = regexp.MustCompile(`^[a-z]([a-z0-9-]{0,38}[a-z0-9])?$`)
	envNameRe = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)
	// イメージは「レジストリ/名前:タグ」か「…@sha256:…」。空白・制御文字・引用符は入れない
	imageRe = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._/:@-]{0,254}$`)
)

// EnvVar はコンテナの環境変数（秘密は入れない。YAML は git に残る。秘密はシークレットにして Secrets でつなぐ）
type EnvVar struct {
	Name  string
	Value string
}

// FunctionSpec はコンソールのフォームで決められる範囲の関数の定義。
// 関数はコンテナイメージを、リクエストが来たときだけ動かす（台数は API Gateway が 0 と 1 を行き来させる）。
// これを Kubernetes の YAML（Deployment・Service）にして、アプリ用のリポジトリに置く。外からは API（HTTPRoute）を通してだけ届く
type FunctionSpec struct {
	Name  string
	Image string
	Port  int32
	// InstanceType は t1.small など。CPUMillis・MemoryBytes が 0 なら型の値を使う
	InstanceType string
	CPUMillis    int64
	MemoryBytes  int64
	Env          []EnvVar
	Alerts       []string
	Notify       []string
	// Databases・Buckets はつなぐデータベースとバケットの名前。接続先の Secret を、接頭辞を付けた環境変数として入れる
	Databases []string
	Buckets   []string
	// Secrets は環境変数に入れるシークレット（API キーなど）。値は YAML に書かず、コントローラーが関数の namespace に置く Secret から入る
	Secrets []SecretRef
}

// FieldError はどの項目がなぜ通らないか
type FieldError struct {
	Field   string
	Message string
}

func (e *FieldError) Error() string { return e.Field + ": " + e.Message }

func fieldErr(field, format string, a ...any) error {
	return &FieldError{Field: field, Message: fmt.Sprintf(format, a...)}
}

// ValidName は URL とファイル名に使える名前か
func ValidName(name string) bool { return appNameRe.MatchString(name) }

// Normalize は型の値で CPU・メモリを埋め、監視と通知先を決まった順に並べる
func (s FunctionSpec) Normalize() FunctionSpec {
	if t, ok := InstanceTypeOf(s.InstanceType); ok {
		if s.CPUMillis == 0 {
			s.CPUMillis = t.CPUMillis
		}
		if s.MemoryBytes == 0 {
			s.MemoryBytes = t.MemoryBytes
		}
	}
	s.Databases, s.Buckets = connections(s.Databases), connections(s.Buckets)
	if len(s.Secrets) == 0 {
		s.Secrets = nil
	}
	for i, r := range s.Secrets {
		s.Secrets[i] = SecretRef{Env: strings.TrimSpace(r.Env), Secret: strings.TrimSpace(r.Secret)}
	}
	s.Alerts = ordered(s.Alerts, alertIDs())
	s.Notify = ordered(s.Notify, NotifyChannels)
	return s
}

// ordered は known の順に並べ、重複を除く。known にないものは後ろに残す（Validate で弾く）
func ordered(values, known []string) []string {
	out := []string{}
	for _, k := range known {
		if slices.Contains(values, k) {
			out = append(out, k)
		}
	}
	for _, v := range values {
		if !slices.Contains(known, v) && !slices.Contains(out, v) {
			out = append(out, v)
		}
	}
	return out
}

// Validate は Normalize 済みの定義を確かめる
func (s FunctionSpec) Validate() error {
	if !ValidName(s.Name) {
		return fieldErr("name", "名前は英小文字で始め、英小文字・数字・ハイフンで 40 文字までにしてください")
	}
	if !imageRe.MatchString(s.Image) {
		return fieldErr("image", "イメージは ghcr.io/owner/name:tag の形で指定してください")
	}
	if s.Port < 1 || s.Port > 65535 {
		return fieldErr("port", "ポートは 1〜65535 です")
	}
	if _, ok := InstanceTypeOf(s.InstanceType); !ok {
		return fieldErr("instance_type", "インスタンスタイプ %q はありません", s.InstanceType)
	}
	if s.CPUMillis < MinCPUMillis || s.CPUMillis > MaxCPUMillis {
		return fieldErr("cpu_millis", "CPU は %d〜%d ミリコアです", MinCPUMillis, MaxCPUMillis)
	}
	if s.MemoryBytes < MinMemoryBytes || s.MemoryBytes > MaxMemoryBytes || s.MemoryBytes%mib != 0 {
		return fieldErr("memory", "メモリは %d〜%d MiB（1 MiB 単位）です", MinMemoryBytes/mib, MaxMemoryBytes/mib)
	}
	seen := map[string]bool{}
	for _, e := range s.Env {
		if !envNameRe.MatchString(e.Name) || seen[e.Name] {
			return fieldErr("env", "環境変数の名前 %q が正しくないか、重複しています", e.Name)
		}
		seen[e.Name] = true
	}
	if len(s.Secrets) > MaxFunctionSecrets {
		return fieldErr("secrets", "シークレットは %d 個までです", MaxFunctionSecrets)
	}
	for _, r := range s.Secrets {
		if !envNameRe.MatchString(r.Env) || seen[r.Env] {
			return fieldErr("secrets", "環境変数の名前 %q が正しくないか、ほかの環境変数と重複しています", r.Env)
		}
		seen[r.Env] = true
		if !ValidName(r.Secret) {
			return fieldErr("secrets", "シークレット %q の名前が正しくありません", r.Secret)
		}
	}
	for _, a := range s.Alerts {
		if _, ok := AlertPresetOf(a); !ok {
			return fieldErr("alerts", "監視 %q はありません", a)
		}
	}
	for _, d := range s.Databases {
		if !ValidName(d) {
			return fieldErr("databases", "データベース %q の名前が正しくありません", d)
		}
	}
	for _, b := range s.Buckets {
		if !ValidName(b) {
			return fieldErr("buckets", "バケット %q の名前が正しくありません", b)
		}
	}
	for _, n := range s.Notify {
		if !slices.Contains(NotifyChannels, n) {
			return fieldErr("notify", "通知先 %q はありません", n)
		}
	}
	return nil
}

// SecretNames はつなぐシークレットの名前（重複を除き、名前の順）
func (s FunctionSpec) SecretNames() []string {
	names := make([]string, 0, len(s.Secrets))
	for _, r := range s.Secrets {
		names = append(names, r.Secret)
	}
	return connections(names)
}

// Custom は型の値から CPU・メモリを変えているか
func (s FunctionSpec) Custom() bool {
	t, ok := InstanceTypeOf(s.InstanceType)
	return ok && (t.CPUMillis != s.CPUMillis || t.MemoryBytes != s.MemoryBytes)
}

// ---- Kubernetes の YAML（使う項目だけ。順番は書き出す順）----

type objectMeta struct {
	Name        string            `yaml:"name"`
	Namespace   string            `yaml:"namespace,omitempty"`
	Labels      map[string]string `yaml:"labels,omitempty"`
	Annotations map[string]string `yaml:"annotations,omitempty"`
}

type typeMeta struct {
	APIVersion string `yaml:"apiVersion"`
	Kind       string `yaml:"kind"`
}

type k8sEnv struct {
	Name string `yaml:"name"`
	// Value はふつうの環境変数（空の値も書く）。シークレットのものは ValueFrom
	Value     *string       `yaml:"value,omitempty"`
	ValueFrom *k8sEnvSource `yaml:"valueFrom,omitempty"`
}

type k8sKeyRef struct {
	Name string `yaml:"name"`
	Key  string `yaml:"key"`
}

type k8sEnvSource struct {
	SecretKeyRef *k8sKeyRef `yaml:"secretKeyRef,omitempty"`
	// Other は fieldRef・configMapKeyRef など（手で書いた YAML のもの。フォームでは扱わない）
	Other map[string]any `yaml:",inline"`
}

type k8sEnvFrom struct {
	Prefix    string `yaml:"prefix"`
	SecretRef struct {
		Name string `yaml:"name"`
	} `yaml:"secretRef"`
}

type k8sContainer struct {
	Name  string `yaml:"name"`
	Image string `yaml:"image"`
	Ports []struct {
		Name          string `yaml:"name,omitempty"`
		ContainerPort int32  `yaml:"containerPort"`
	} `yaml:"ports,omitempty"`
	Env       []k8sEnv     `yaml:"env,omitempty"`
	EnvFrom   []k8sEnvFrom `yaml:"envFrom,omitempty"`
	Resources struct {
		Requests map[string]string `yaml:"requests,omitempty"`
		Limits   map[string]string `yaml:"limits,omitempty"`
	} `yaml:"resources"`
	SecurityContext struct {
		AllowPrivilegeEscalation bool `yaml:"allowPrivilegeEscalation"`
	} `yaml:"securityContext"`
}

type k8sDeployment struct {
	typeMeta `yaml:",inline"`
	Metadata objectMeta `yaml:"metadata"`
	Spec     struct {
		// 台数は書かない（API Gateway が決める。書くと Argo CD が書いた値に戻してしまう）
		Replicas *int32 `yaml:"replicas,omitempty"`
		Selector struct {
			MatchLabels map[string]string `yaml:"matchLabels"`
		} `yaml:"selector"`
		Template struct {
			Metadata struct {
				Labels map[string]string `yaml:"labels"`
			} `yaml:"metadata"`
			Spec struct {
				PriorityClassName            string `yaml:"priorityClassName"`
				AutomountServiceAccountToken bool   `yaml:"automountServiceAccountToken"`
				EnableServiceLinks           bool   `yaml:"enableServiceLinks"`
				SecurityContext              struct {
					SeccompProfile struct {
						Type string `yaml:"type"`
					} `yaml:"seccompProfile"`
				} `yaml:"securityContext"`
				Containers []k8sContainer `yaml:"containers"`
			} `yaml:"spec"`
		} `yaml:"template"`
	} `yaml:"spec"`
}

type k8sService struct {
	typeMeta `yaml:",inline"`
	Metadata objectMeta `yaml:"metadata"`
	Spec     struct {
		Selector map[string]string `yaml:"selector"`
		Ports    []struct {
			Name       string `yaml:"name"`
			Port       int32  `yaml:"port"`
			TargetPort string `yaml:"targetPort"`
		} `yaml:"ports"`
	} `yaml:"spec"`
}

const (
	containerName = "app"
	portName      = "http"
)

// FunctionNamespace は関数ごとの namespace（本番 taramanji-cloud-fn-<名前>、stg・dev は taramanji-cloud-stg-fn-<名前>・taramanji-cloud-dev-fn-<名前>）。
// 関数どうしを namespace で分け、ほかの関数の Secret・Pod に触れられないようにする。namespace と囲い（Quota・NetworkPolicy など）は
// コントローラーが作る（アプリ用のリポジトリからは作れない）
func FunctionNamespace(env, name string) string {
	if env == "prod" {
		return "taramanji-cloud-fn-" + name
	}
	return "taramanji-cloud-" + env + "-fn-" + name
}

// FunctionRegistrationName は関数の登録（共有の namespace に置く ConfigMap）の名前。コントローラーはこれを見て namespace を作る
func FunctionRegistrationName(name string) string { return "function-" + name }

// 登録の ConfigMap のラベルと、data のキー
const (
	LabelFunction       = "cloud.taramanji.com/function"
	RegistrationCPU     = "cpuMillis"
	RegistrationMemory  = "memoryMiB"
	RegistrationDBs     = "databases"
	RegistrationBuckets = "buckets"
)

// Registration は登録の中身（コントローラーが namespace の囲いと接続先の Secret を作るのに使う）
type Registration struct {
	Name        string
	CPUMillis   int64
	MemoryBytes int64
	Databases   []string
	Buckets     []string
	Secrets     []string
}

// RegistrationData は登録の ConfigMap の data。シークレットはつないだときだけ書く（前からある YAML を変えないため）
func (s FunctionSpec) RegistrationData() map[string]string {
	data := map[string]string{
		RegistrationCPU: strconv.FormatInt(s.CPUMillis, 10), RegistrationMemory: strconv.FormatInt(s.MemoryBytes/mib, 10),
		RegistrationDBs: strings.Join(s.Databases, ","), RegistrationBuckets: strings.Join(s.Buckets, ","),
	}
	if names := s.SecretNames(); len(names) > 0 {
		data[RegistrationSecrets] = strings.Join(names, ",")
	}
	return data
}

// ParseRegistration は登録の ConfigMap の data を読む（コントローラー用）。読めなければ ok = false
func ParseRegistration(name string, data map[string]string) (Registration, bool) {
	cpu, err1 := strconv.ParseInt(data[RegistrationCPU], 10, 64)
	mem, err2 := strconv.ParseInt(data[RegistrationMemory], 10, 64)
	if err1 != nil || err2 != nil || !ValidName(name) || cpu < MinCPUMillis || cpu > MaxCPUMillis || mem*mib < MinMemoryBytes || mem*mib > MaxMemoryBytes {
		return Registration{}, false
	}
	r := Registration{Name: name, CPUMillis: cpu, MemoryBytes: mem * mib, Databases: splitList(data[RegistrationDBs]), Buckets: splitList(data[RegistrationBuckets]),
		Secrets: splitList(data[RegistrationSecrets])}
	for _, n := range slices.Concat(r.Databases, r.Buckets, r.Secrets) {
		if !ValidName(n) {
			return Registration{}, false
		}
	}
	return r, true
}

func cpuQuantity(millis int64) string { return strconv.FormatInt(millis, 10) + "m" }
func memQuantity(bytes int64) string  { return strconv.FormatInt(bytes/mib, 10) + "Mi" }

// RenderFunctionYAML は定義を Kubernetes の YAML にする:
//   - 登録の ConfigMap（namespace は書かない = 環境の共有の namespace に入る。コントローラーが見る）
//   - Deployment・Service（関数の namespace ns に入る）
func RenderFunctionYAML(s FunctionSpec, ns string) (string, error) {
	labels := map[string]string{"app.kubernetes.io/name": s.Name, LabelApp: s.Name, LabelKind: KindFunction}

	var d k8sDeployment
	d.APIVersion, d.Kind = "apps/v1", "Deployment"
	d.Metadata = objectMeta{Name: s.Name, Namespace: ns, Labels: map[string]string{"app.kubernetes.io/name": s.Name, LabelApp: s.Name, LabelKind: KindFunction, LabelInstanceType: s.InstanceType}}
	if len(s.Alerts) > 0 {
		d.Metadata.Annotations = map[string]string{AnnotationAlerts: strings.Join(s.Alerts, ",")}
		if len(s.Notify) > 0 {
			d.Metadata.Annotations[AnnotationNotify] = strings.Join(s.Notify, ",")
		}
	}
	d.Spec.Selector.MatchLabels = map[string]string{LabelApp: s.Name}
	d.Spec.Template.Metadata.Labels = labels
	d.Spec.Template.Spec.PriorityClassName = PriorityClass
	d.Spec.Template.Spec.SecurityContext.SeccompProfile.Type = "RuntimeDefault"
	c := k8sContainer{Name: containerName, Image: s.Image}
	c.Ports = append(c.Ports, struct {
		Name          string `yaml:"name,omitempty"`
		ContainerPort int32  `yaml:"containerPort"`
	}{Name: portName, ContainerPort: s.Port})
	for _, e := range s.Env {
		c.Env = append(c.Env, k8sEnv{Name: e.Name, Value: &e.Value})
	}
	// シークレットは値を書かず、コントローラーが関数の namespace に置く Secret（secret-<名前>）から入れる
	for _, r := range s.Secrets {
		c.Env = append(c.Env, k8sEnv{Name: r.Env, ValueFrom: &k8sEnvSource{SecretKeyRef: &k8sKeyRef{Name: SecretObjectName(r.Secret), Key: SecretValueKey}}})
	}
	// つないだデータベース・バケットの接続先（コントローラーが作る Secret）を、接頭辞を付けて環境変数にする
	for _, d := range s.Databases {
		c.EnvFrom = append(c.EnvFrom, envFrom(DatabaseEnvPrefix(d), DatabaseObjectName(d)))
	}
	for _, b := range s.Buckets {
		c.EnvFrom = append(c.EnvFrom, envFrom(BucketEnvPrefix(b), BucketSecretName(b)))
	}
	// requests = limits（メモリは LimitRange が同じ値を求める。CPU もそろえて、予約した分をそのまま使える上限にする）
	res := map[string]string{"cpu": cpuQuantity(s.CPUMillis), "memory": memQuantity(s.MemoryBytes)}
	c.Resources.Requests, c.Resources.Limits = res, res
	d.Spec.Template.Spec.Containers = []k8sContainer{c}

	var svc k8sService
	svc.APIVersion, svc.Kind = "v1", "Service"
	svc.Metadata = objectMeta{Name: s.Name, Namespace: ns, Labels: labels}
	svc.Spec.Selector = map[string]string{LabelApp: s.Name}
	svc.Spec.Ports = append(svc.Spec.Ports, struct {
		Name       string `yaml:"name"`
		Port       int32  `yaml:"port"`
		TargetPort string `yaml:"targetPort"`
	}{Name: portName, Port: 80, TargetPort: portName})

	var reg k8sConfigMap
	reg.APIVersion, reg.Kind = "v1", "ConfigMap"
	reg.Metadata = objectMeta{Name: FunctionRegistrationName(s.Name), Labels: map[string]string{LabelKind: KindFunction, LabelFunction: s.Name}}
	reg.Data = s.RegistrationData()
	return encodeDocs(reg, d, svc)
}

func envFrom(prefix, secret string) k8sEnvFrom {
	e := k8sEnvFrom{Prefix: prefix}
	e.SecretRef.Name = secret
	return e
}

func encodeDocs(docs ...any) (string, error) {
	var buf bytes.Buffer
	enc := yaml.NewEncoder(&buf)
	enc.SetIndent(2)
	for _, doc := range docs {
		if err := enc.Encode(doc); err != nil {
			return "", err
		}
	}
	if err := enc.Close(); err != nil {
		return "", err
	}
	return buf.String(), nil
}

// 関数の YAML に置ける種類（HTTPRoute は API の YAML に書く）
var functionKinds = map[string]bool{"Deployment": true, "Service": true, "ConfigMap": true, "PersistentVolumeClaim": true}

// ParsedFunction は YAML から読み取ったアプリ
type ParsedFunction struct {
	Spec FunctionSpec
	// FormEditable は、この YAML がフォームの定義だけで作り直せるか。
	// false なら手で書き足した部分がある（フォームで保存すると消えるので、YAML のまま編集する）
	FormEditable bool
}

func splitDocs(src string) ([]map[string]any, error) {
	dec := yaml.NewDecoder(strings.NewReader(src))
	var docs []map[string]any
	for {
		var m map[string]any
		err := dec.Decode(&m)
		if errors.Is(err, io.EOF) {
			return docs, nil
		}
		if err != nil {
			return nil, err
		}
		if m != nil {
			docs = append(docs, m)
		}
	}
}

// checkObjects は YAML の全オブジェクトが、置ける種類で、namespace の決まりに合い、名前が name か「name-…」であることを確かめる。
// nsOf は（種類・名前）ごとに書くべき namespace を返す（"" なら書かない = 環境の共有の namespace）
func checkObjects(name string, docs []map[string]any, kinds map[string]bool, kindList string, nsOf func(kind, objName string) string) error {
	for _, doc := range docs {
		kind, _ := doc["kind"].(string)
		if !kinds[kind] {
			return fieldErr("yaml", "%q は置けません（%s だけ）", kind, kindList)
		}
		meta, _ := doc["metadata"].(map[string]any)
		objName, _ := meta["name"].(string)
		ns, _ := meta["namespace"].(string)
		if want := nsOf(kind, objName); ns != want {
			if want == "" {
				return fieldErr("yaml", "%s %q に metadata.namespace は書かないでください（この環境の共有の namespace に入ります）", kind, objName)
			}
			return fieldErr("yaml", "%s %q の metadata.namespace は %s にしてください（関数ごとの namespace）", kind, objName, want)
		}
		if kind == "ConfigMap" && objName == FunctionRegistrationName(name) {
			continue
		}
		// ほかのリソースのものを上書きしないよう、名前はリソース名か「リソース名-…」に限る
		if objName != name && !strings.HasPrefix(objName, name+"-") {
			return fieldErr("yaml", "%s の名前 %q は %q か %q で始めてください", kind, objName, name, name+"-")
		}
	}
	return nil
}

func parseDocs(src string) ([]map[string]any, error) {
	if len(src) > MaxYAMLBytes {
		return nil, fieldErr("yaml", "YAML が大きすぎます（%d KB まで）", MaxYAMLBytes>>10)
	}
	docs, err := splitDocs(src)
	if err != nil {
		return nil, fieldErr("yaml", "YAML として読めません: %v", err)
	}
	return docs, nil
}

// decodeKind は YAML の中の kind のオブジェクトを out に読む。見つけた数を返す
func decodeKind(src, kind string, out any) (int, error) {
	n := 0
	dec := yaml.NewDecoder(strings.NewReader(src))
	for {
		var node yaml.Node
		if err := dec.Decode(&node); err != nil {
			return n, nil
		}
		var tm typeMeta
		if node.Decode(&tm) != nil || tm.Kind != kind {
			continue
		}
		if n++; n == 1 {
			if err := node.Decode(out); err != nil {
				return n, fieldErr("yaml", "%s を読めません: %v", kind, err)
			}
		}
	}
}

// ParseFunctionYAML は関数 1 つの YAML を確かめて、定義を読み取る。
// 手で書いた YAML も受けるが、アプリ用 namespace の囲いを外すもの（別の namespace・許可していない種類・優先度なし）と、
// API Gateway の邪魔になるもの（台数の指定）は通さない
func ParseFunctionYAML(name, src, ns string) (*ParsedFunction, error) {
	docs, err := parseDocs(src)
	if err != nil {
		return nil, err
	}
	// 登録の ConfigMap だけが共有の namespace に入り、ほかは全部この関数の namespace に入る
	nsOf := func(kind, objName string) string {
		if kind == "ConfigMap" && objName == FunctionRegistrationName(name) {
			return ""
		}
		return ns
	}
	if err := checkObjects(name, docs, functionKinds, "Deployment・Service・ConfigMap・PersistentVolumeClaim", nsOf); err != nil {
		return nil, err
	}
	var reg *k8sConfigMap
	for _, doc := range docs {
		meta, _ := doc["metadata"].(map[string]any)
		if doc["kind"] == "ConfigMap" && meta["name"] == FunctionRegistrationName(name) {
			if reg != nil {
				return nil, fieldErr("yaml", "登録の ConfigMap %s が 2 つあります", FunctionRegistrationName(name))
			}
			reg = &k8sConfigMap{}
			b, _ := yaml.Marshal(doc)
			if err := yaml.Unmarshal(b, reg); err != nil {
				return nil, fieldErr("yaml", "登録の ConfigMap を読めません: %v", err)
			}
		}
	}
	if reg == nil {
		return nil, fieldErr("yaml", "登録の ConfigMap %s がありません（コントローラーが関数の namespace を作るのに使います）", FunctionRegistrationName(name))
	}
	var d k8sDeployment
	n, err := decodeKind(src, "Deployment", &d)
	if err != nil {
		return nil, err
	}
	if n != 1 {
		return nil, fieldErr("yaml", "Deployment は 1 つだけ書いてください（%d 個あります）", n)
	}
	if d.Metadata.Name != name {
		return nil, fieldErr("yaml", "Deployment の名前は %q にしてください", name)
	}
	if d.Spec.Replicas != nil {
		return nil, fieldErr("yaml", "spec.replicas は書かないでください（台数は API Gateway が決めます）")
	}
	if d.Spec.Template.Spec.PriorityClassName != PriorityClass {
		return nil, fieldErr("yaml", "Pod に priorityClassName: %s を付けてください（ないと作れません）", PriorityClass)
	}
	if len(d.Spec.Template.Spec.Containers) == 0 {
		return nil, fieldErr("yaml", "コンテナがありません")
	}

	c := d.Spec.Template.Spec.Containers[0]
	spec := FunctionSpec{Name: name, Image: c.Image, InstanceType: d.Metadata.Labels[LabelInstanceType]}
	if len(c.Ports) > 0 {
		spec.Port = c.Ports[0].ContainerPort
	}
	for _, e := range c.Env {
		switch {
		case e.ValueFrom == nil:
			v := ""
			if e.Value != nil {
				v = *e.Value
			}
			spec.Env = append(spec.Env, EnvVar{Name: e.Name, Value: v})
		case e.ValueFrom.SecretKeyRef != nil:
			// 読ませてよい Secret はシークレット（secret-<名前>）だけ。ほかの Secret（イメージを読む認証情報など）は読ませない
			ref := e.ValueFrom.SecretKeyRef
			s, ok := strings.CutPrefix(ref.Name, "secret-")
			if !ok || !ValidName(s) || ref.Key != SecretValueKey {
				return nil, fieldErr("yaml", "環境変数 %s の secretKeyRef は、シークレット（name: secret-<名前>、key: %s）だけにしてください", e.Name, SecretValueKey)
			}
			spec.Secrets = append(spec.Secrets, SecretRef{Env: e.Name, Secret: s})
		default:
			// fieldRef・configMapKeyRef など。入れられるが、フォームでは扱わない（フォームで編集できなくなる）
		}
	}
	for _, e := range c.EnvFrom {
		if n, ok := strings.CutPrefix(e.SecretRef.Name, "db-"); ok {
			spec.Databases = append(spec.Databases, n)
		} else if n, ok := strings.CutPrefix(e.SecretRef.Name, "bucket-"); ok {
			spec.Buckets = append(spec.Buckets, n)
		} else {
			// アプリ用 namespace のほかの Secret（別のリソースの接続先など）を勝手に読ませない
			return nil, fieldErr("yaml", "envFrom の secretRef は、つなぐデータベース（db-<名前>）かバケット（bucket-<名前>）だけにしてください")
		}
	}
	if spec.CPUMillis, err = parseCPU(c.Resources.Limits["cpu"]); err != nil {
		return nil, fieldErr("yaml", "resources.limits.cpu: %v", err)
	}
	if spec.MemoryBytes, err = parseMemory(c.Resources.Limits["memory"]); err != nil {
		return nil, fieldErr("yaml", "resources.limits.memory: %v", err)
	}
	if spec.InstanceType == "" {
		spec.InstanceType = nearestType(spec.CPUMillis, spec.MemoryBytes)
	}
	spec.Alerts = splitList(d.Metadata.Annotations[AnnotationAlerts])
	spec.Notify = splitList(d.Metadata.Annotations[AnnotationNotify])
	spec = spec.Normalize()
	// 登録は Deployment と同じ中身でなければならない（コントローラーは登録を見て、namespace の枠と接続先の Secret を作る）
	if reg.Metadata.Labels[LabelFunction] != name || !maps.Equal(reg.Data, spec.RegistrationData()) {
		return nil, fieldErr("yaml", "登録の ConfigMap（ラベル %s と data）が Deployment の CPU・メモリ・つなぐもの（データベース・バケット・シークレット）と合っていません", LabelFunction)
	}
	for _, a := range spec.Alerts {
		if _, ok := AlertPresetOf(a); !ok {
			return nil, fieldErr("yaml", "注釈 %s の %q は用意された監視にありません", AnnotationAlerts, a)
		}
	}
	for _, n := range spec.Notify {
		if !slices.Contains(NotifyChannels, n) {
			return nil, fieldErr("yaml", "注釈 %s の %q は通知先にありません", AnnotationNotify, n)
		}
	}

	// フォームの定義から作り直した YAML と中身が同じなら、フォームで編集できる
	editable := false
	if spec.Validate() == nil {
		if again, err := RenderFunctionYAML(spec, ns); err == nil {
			if want, err := splitDocs(again); err == nil {
				editable = reflect.DeepEqual(docs, want)
			}
		}
	}
	return &ParsedFunction{Spec: spec, FormEditable: editable}, nil
}

func splitList(s string) []string {
	out := []string{}
	for _, v := range strings.Split(s, ",") {
		if v = strings.TrimSpace(v); v != "" {
			out = append(out, v)
		}
	}
	return out
}

// nearestType は CPU・メモリが収まる一番小さい型（ラベルのない手書きの YAML 用）
func nearestType(cpu, mem int64) string {
	// 汎用（t1）で収まればそれ、なければ c1・r1 の順に、収まる一番小さいもの
	for _, t := range InstanceTypes {
		if cpu <= t.CPUMillis && mem <= t.MemoryBytes {
			return t.Name
		}
	}
	return "t1.xlarge"
}

// parseCPU は "250m"・"1"・"0.5" をミリコアにする
func parseCPU(q string) (int64, error) {
	if q == "" {
		return 0, errors.New("書かれていません")
	}
	if v, ok := strings.CutSuffix(q, "m"); ok {
		n, err := strconv.ParseInt(v, 10, 64)
		if err != nil || n < 0 {
			return 0, fmt.Errorf("%q を読めません", q)
		}
		return n, nil
	}
	f, err := strconv.ParseFloat(q, 64)
	if err != nil || f < 0 {
		return 0, fmt.Errorf("%q を読めません", q)
	}
	return int64(f*1000 + 0.5), nil
}

var memUnits = []struct {
	suffix string
	mul    int64
}{{"Ki", 1 << 10}, {"Mi", 1 << 20}, {"Gi", 1 << 30}, {"k", 1000}, {"M", 1000 * 1000}, {"G", 1000 * 1000 * 1000}}

// parseMemory は "256Mi"・"1Gi"・バイト数をバイトにする
func parseMemory(q string) (int64, error) {
	if q == "" {
		return 0, errors.New("書かれていません")
	}
	mul := int64(1)
	for _, u := range memUnits {
		if v, ok := strings.CutSuffix(q, u.suffix); ok {
			q, mul = v, u.mul
			break
		}
	}
	f, err := strconv.ParseFloat(q, 64)
	if err != nil || f < 0 {
		return 0, fmt.Errorf("%q を読めません", q)
	}
	return int64(f * float64(mul)), nil
}
