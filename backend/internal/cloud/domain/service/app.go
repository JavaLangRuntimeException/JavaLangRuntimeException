package service

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"reflect"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"go.yaml.in/yaml/v3"
)

// アプリの Deployment に付けるラベル・注釈。YAML を手で書くときも同じものを付ければ、コンソールが同じように読む
const (
	LabelApp          = "cloud.taramanji.com/app"
	LabelInstanceType = "cloud.taramanji.com/instance-type"
	// 用意した監視（AlertPresets の ID）と通知先（NotifyChannels）。どちらもカンマ区切り
	AnnotationAlerts = "cloud.taramanji.com/alerts"
	AnnotationNotify = "cloud.taramanji.com/notify"
	// アプリ用 namespace は、この優先度が付いていない Pod を作れない（ResourceQuota require-cloud-priority）
	PriorityClass = "cloud-workload"
	MaxReplicas   = int32(3)
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
	// 名前は URL（<名前>-hosting.taramanji.com）とファイル名になる。DNS のラベルで、長さは接尾辞の分を空けておく
	appNameRe = regexp.MustCompile(`^[a-z]([a-z0-9-]{0,38}[a-z0-9])?$`)
	envNameRe = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)
	// イメージは「レジストリ/名前:タグ」か「…@sha256:…」。空白・制御文字・引用符は入れない
	imageRe = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._/:@-]{0,254}$`)
)

// EnvVar はコンテナの環境変数（秘密は入れない。YAML は git に残る）
type EnvVar struct {
	Name  string
	Value string
}

// AppSpec はコンソールのフォームで決められる範囲のアプリ（コンテナ）の定義。
// これを Kubernetes の YAML（Deployment・Service・HTTPRoute）にして、アプリ用のリポジトリに置く
type AppSpec struct {
	Name     string
	Image    string
	Port     int32
	Replicas int32
	// InstanceType は t1.small など。CPUMillis・MemoryBytes が 0 なら型の値を使う
	InstanceType string
	CPUMillis    int64
	MemoryBytes  int64
	Env          []EnvVar
	Alerts       []string
	Notify       []string
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

// ValidAppName は URL とファイル名に使える名前か
func ValidAppName(name string) bool { return appNameRe.MatchString(name) }

// Normalize は型の値で CPU・メモリを埋め、監視と通知先を決まった順に並べる
func (s AppSpec) Normalize() AppSpec {
	if t, ok := InstanceTypeOf(s.InstanceType); ok {
		if s.CPUMillis == 0 {
			s.CPUMillis = t.CPUMillis
		}
		if s.MemoryBytes == 0 {
			s.MemoryBytes = t.MemoryBytes
		}
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
func (s AppSpec) Validate() error {
	if !ValidAppName(s.Name) {
		return fieldErr("name", "名前は英小文字で始め、英小文字・数字・ハイフンで 40 文字までにしてください")
	}
	if !imageRe.MatchString(s.Image) {
		return fieldErr("image", "イメージは ghcr.io/owner/name:tag の形で指定してください")
	}
	if s.Port < 1 || s.Port > 65535 {
		return fieldErr("port", "ポートは 1〜65535 です")
	}
	if s.Replicas < 0 || s.Replicas > MaxReplicas {
		return fieldErr("replicas", "台数は 0〜%d です", MaxReplicas)
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
	for _, a := range s.Alerts {
		if _, ok := AlertPresetOf(a); !ok {
			return fieldErr("alerts", "監視 %q はありません", a)
		}
	}
	for _, n := range s.Notify {
		if !slices.Contains(NotifyChannels, n) {
			return fieldErr("notify", "通知先 %q はありません", n)
		}
	}
	return nil
}

// Custom は型の値から CPU・メモリを変えているか
func (s AppSpec) Custom() bool {
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
	Name  string `yaml:"name"`
	Value string `yaml:"value"`
}

type k8sContainer struct {
	Name  string `yaml:"name"`
	Image string `yaml:"image"`
	Ports []struct {
		Name          string `yaml:"name,omitempty"`
		ContainerPort int32  `yaml:"containerPort"`
	} `yaml:"ports,omitempty"`
	Env       []k8sEnv `yaml:"env,omitempty"`
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
		Replicas *int32 `yaml:"replicas"`
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

type k8sHTTPRoute struct {
	typeMeta `yaml:",inline"`
	Metadata objectMeta `yaml:"metadata"`
	Spec     struct {
		ParentRefs []struct {
			Name        string `yaml:"name"`
			Namespace   string `yaml:"namespace"`
			SectionName string `yaml:"sectionName"`
		} `yaml:"parentRefs"`
		Hostnames []string `yaml:"hostnames"`
		Rules     []struct {
			BackendRefs []struct {
				Name string `yaml:"name"`
				Port int32  `yaml:"port"`
			} `yaml:"backendRefs"`
		} `yaml:"rules"`
	} `yaml:"spec"`
}

// cloud の Gateway（deploy/cloud/platform/gateway.yaml）
const (
	gatewayName      = "cloud"
	gatewayNamespace = "cloud-gateway"
	gatewayListener  = "http"
	containerName    = "app"
	portName         = "http"
)

// HostOf はアプリの公開ホスト名（<名前> + "-hosting.taramanji.com" など）
func HostOf(name, hostSuffix string) string { return name + hostSuffix }

func cpuQuantity(millis int64) string { return strconv.FormatInt(millis, 10) + "m" }
func memQuantity(bytes int64) string  { return strconv.FormatInt(bytes/mib, 10) + "Mi" }

// RenderYAML は定義を Kubernetes の YAML（Deployment・Service・HTTPRoute）にする。
// namespace は書かない（Argo CD がその環境のアプリ用 namespace に入れる）
func RenderYAML(s AppSpec, hostSuffix string) (string, error) {
	labels := map[string]string{"app.kubernetes.io/name": s.Name, LabelApp: s.Name}

	var d k8sDeployment
	d.APIVersion, d.Kind = "apps/v1", "Deployment"
	d.Metadata = objectMeta{Name: s.Name, Labels: map[string]string{"app.kubernetes.io/name": s.Name, LabelApp: s.Name, LabelInstanceType: s.InstanceType}}
	if len(s.Alerts) > 0 {
		d.Metadata.Annotations = map[string]string{AnnotationAlerts: strings.Join(s.Alerts, ",")}
		if len(s.Notify) > 0 {
			d.Metadata.Annotations[AnnotationNotify] = strings.Join(s.Notify, ",")
		}
	}
	d.Spec.Replicas = &s.Replicas
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
		c.Env = append(c.Env, k8sEnv(e))
	}
	// requests = limits（メモリは LimitRange が同じ値を求める。CPU もそろえて、予約した分をそのまま使える上限にする）
	res := map[string]string{"cpu": cpuQuantity(s.CPUMillis), "memory": memQuantity(s.MemoryBytes)}
	c.Resources.Requests, c.Resources.Limits = res, res
	d.Spec.Template.Spec.Containers = []k8sContainer{c}

	var svc k8sService
	svc.APIVersion, svc.Kind = "v1", "Service"
	svc.Metadata = objectMeta{Name: s.Name, Labels: labels}
	svc.Spec.Selector = map[string]string{LabelApp: s.Name}
	svc.Spec.Ports = append(svc.Spec.Ports, struct {
		Name       string `yaml:"name"`
		Port       int32  `yaml:"port"`
		TargetPort string `yaml:"targetPort"`
	}{Name: portName, Port: 80, TargetPort: portName})

	var r k8sHTTPRoute
	r.APIVersion, r.Kind = "gateway.networking.k8s.io/v1", "HTTPRoute"
	r.Metadata = objectMeta{Name: s.Name, Labels: labels}
	r.Spec.ParentRefs = append(r.Spec.ParentRefs, struct {
		Name        string `yaml:"name"`
		Namespace   string `yaml:"namespace"`
		SectionName string `yaml:"sectionName"`
	}{Name: gatewayName, Namespace: gatewayNamespace, SectionName: gatewayListener})
	r.Spec.Hostnames = []string{HostOf(s.Name, hostSuffix)}
	r.Spec.Rules = append(r.Spec.Rules, struct {
		BackendRefs []struct {
			Name string `yaml:"name"`
			Port int32  `yaml:"port"`
		} `yaml:"backendRefs"`
	}{BackendRefs: []struct {
		Name string `yaml:"name"`
		Port int32  `yaml:"port"`
	}{{Name: s.Name, Port: 80}}})

	var buf bytes.Buffer
	enc := yaml.NewEncoder(&buf)
	enc.SetIndent(2)
	for _, doc := range []any{d, svc, r} {
		if err := enc.Encode(doc); err != nil {
			return "", err
		}
	}
	if err := enc.Close(); err != nil {
		return "", err
	}
	return buf.String(), nil
}

// アプリ用 namespace に置ける種類（Argo CD の AppProject cloud-apps の許可と同じ）
var allowedKinds = map[string]bool{"Deployment": true, "Service": true, "HTTPRoute": true, "ConfigMap": true, "PersistentVolumeClaim": true}

// ParsedApp は YAML から読み取ったアプリ
type ParsedApp struct {
	Spec AppSpec
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

// ParseYAML はアプリ 1 つの YAML を確かめて、定義を読み取る。
// 手で書いた YAML も受けるが、アプリ用 namespace の囲いを外すもの（別の namespace・許可していない種類・
// よそのホスト名・優先度なし）は通さない
func ParseYAML(name, src, hostSuffix string) (*ParsedApp, error) {
	if len(src) > MaxYAMLBytes {
		return nil, fieldErr("yaml", "YAML が大きすぎます（%d KB まで）", MaxYAMLBytes>>10)
	}
	docs, err := splitDocs(src)
	if err != nil {
		return nil, fieldErr("yaml", "YAML として読めません: %v", err)
	}
	var deployments int
	for _, doc := range docs {
		kind, _ := doc["kind"].(string)
		if !allowedKinds[kind] {
			return nil, fieldErr("yaml", "%q は置けません（Deployment・Service・HTTPRoute・ConfigMap・PersistentVolumeClaim だけ）", kind)
		}
		meta, _ := doc["metadata"].(map[string]any)
		if ns, ok := meta["namespace"]; ok && ns != "" {
			return nil, fieldErr("yaml", "metadata.namespace は書かないでください（この環境のアプリ用 namespace に入ります）")
		}
		objName, _ := meta["name"].(string)
		// ほかのアプリのものを上書きしないよう、名前はアプリ名か「アプリ名-…」に限る
		if objName != name && !strings.HasPrefix(objName, name+"-") {
			return nil, fieldErr("yaml", "%s の名前 %q は %q か %q で始めてください", kind, objName, name, name+"-")
		}
		if kind == "Deployment" {
			deployments++
		}
	}
	if deployments != 1 {
		return nil, fieldErr("yaml", "Deployment は 1 つだけ書いてください（%d 個あります）", deployments)
	}

	var d k8sDeployment
	var route *k8sHTTPRoute
	dec := yaml.NewDecoder(strings.NewReader(src))
	for {
		var node yaml.Node
		if err := dec.Decode(&node); err != nil {
			break
		}
		var tm typeMeta
		if node.Decode(&tm) != nil {
			continue
		}
		switch tm.Kind {
		case "Deployment":
			if err := node.Decode(&d); err != nil {
				return nil, fieldErr("yaml", "Deployment を読めません: %v", err)
			}
		case "HTTPRoute":
			var r k8sHTTPRoute
			if err := node.Decode(&r); err != nil {
				return nil, fieldErr("yaml", "HTTPRoute を読めません: %v", err)
			}
			for _, h := range r.Spec.Hostnames {
				if h != HostOf(name, hostSuffix) {
					return nil, fieldErr("yaml", "HTTPRoute のホスト名は %s だけにしてください", HostOf(name, hostSuffix))
				}
			}
			if len(r.Spec.Hostnames) == 0 {
				return nil, fieldErr("yaml", "HTTPRoute に hostnames（%s）を書いてください", HostOf(name, hostSuffix))
			}
			route = &r
		}
	}
	_ = route
	if d.Metadata.Name != name {
		return nil, fieldErr("yaml", "Deployment の名前は %q にしてください", name)
	}
	if d.Spec.Template.Spec.PriorityClassName != PriorityClass {
		return nil, fieldErr("yaml", "Pod に priorityClassName: %s を付けてください（ないと作れません）", PriorityClass)
	}
	if len(d.Spec.Template.Spec.Containers) == 0 {
		return nil, fieldErr("yaml", "コンテナがありません")
	}

	c := d.Spec.Template.Spec.Containers[0]
	spec := AppSpec{Name: name, Image: c.Image, Replicas: 1, InstanceType: d.Metadata.Labels[LabelInstanceType]}
	if d.Spec.Replicas != nil {
		spec.Replicas = *d.Spec.Replicas
	}
	if len(c.Ports) > 0 {
		spec.Port = c.Ports[0].ContainerPort
	}
	for _, e := range c.Env {
		spec.Env = append(spec.Env, EnvVar(e))
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
		if again, err := RenderYAML(spec, hostSuffix); err == nil {
			if want, err := splitDocs(again); err == nil {
				editable = reflect.DeepEqual(docs, want)
			}
		}
	}
	return &ParsedApp{Spec: spec, FormEditable: editable}, nil
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
	for _, t := range InstanceTypes {
		if cpu <= t.CPUMillis && mem <= t.MemoryBytes {
			return t.Name
		}
	}
	return InstanceTypes[len(InstanceTypes)-1].Name
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
