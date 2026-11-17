package service

import (
	"reflect"
	"regexp"
)

// シークレット（AWS の Secrets Manager にあたるもの）: API キーなどの秘密の値を、git に平文で残さずに関数へ渡す。
//   - リポジトリには SealedSecret（クラスターの Sealed Secrets の鍵で暗号化したもの）だけを置く。復号できるのはクラスターの中だけ
//   - Sealed Secrets のコントローラーが、環境の共有の namespace に Secret secret-<名前> を作る
//   - コントローラー（cloud-ctl）が、そのシークレットをつないだ関数の namespace にだけ写す
//   - 関数の Deployment は env の valueFrom.secretKeyRef（secret-<名前>, key: value）で受け取る
const (
	KindSecret = "secret"
	// LabelSecret はシークレットの名前（Sealed Secrets が作る Secret にも付く。コントローラーはこのラベルで探す）
	LabelSecret = "cloud.taramanji.com/secret"
	// SecretValueKey はシークレットの値の入るキー（値は 1 つだけ）
	SecretValueKey = "value"
	// MaxSecretBytes は値の大きさの上限
	MaxSecretBytes = 64 << 10
	// MaxFunctionSecrets は 1 つの関数につなげるシークレットの数
	MaxFunctionSecrets = 20
	// RegistrationSecrets は登録の ConfigMap の data のキー（つなぐシークレットの名前。コントローラーが写すのに使う）
	RegistrationSecrets = "secrets"
	// AnnotationSecretsVersion は関数の Pod テンプレートの注釈。コントローラーが、つないだシークレットの値の印を書く（変わると Pod が入れ替わる）
	AnnotationSecretsVersion = "cloud.taramanji.com/secrets-version"
)

// SecretObjectName はシークレットの SealedSecret・Secret の名前
func SecretObjectName(name string) string { return "secret-" + name }

// SecretRef は関数の環境変数 Env に、シークレット Secret の値を入れる
type SecretRef struct {
	Env    string
	Secret string
}

type k8sSealedSecret struct {
	typeMeta `yaml:",inline"`
	Metadata objectMeta `yaml:"metadata"`
	Spec     struct {
		EncryptedData map[string]string `yaml:"encryptedData"`
		Template      struct {
			Metadata objectMeta `yaml:"metadata"`
			Type     string     `yaml:"type"`
		} `yaml:"template"`
	} `yaml:"spec"`
}

var sealedRe = regexp.MustCompile(`^[A-Za-z0-9+/]+={0,2}$`)

func secretLabels(name string) map[string]string {
	return map[string]string{LabelKind: KindSecret, LabelSecret: name}
}

// RenderSecretYAML はシークレットを Kubernetes の YAML（SealedSecret 1 つ）にする。encrypted は暗号化した値（base64）。
// namespace は書かない（環境の共有の namespace に入る。暗号化もその namespace と名前に結びつける）
func RenderSecretYAML(name, encrypted string) (string, error) {
	var s k8sSealedSecret
	s.APIVersion, s.Kind = "bitnami.com/v1alpha1", "SealedSecret"
	s.Metadata = objectMeta{Name: SecretObjectName(name), Labels: secretLabels(name)}
	s.Spec.EncryptedData = map[string]string{SecretValueKey: encrypted}
	s.Spec.Template.Metadata = objectMeta{Name: SecretObjectName(name), Labels: secretLabels(name)}
	s.Spec.Template.Type = "Opaque"
	return encodeDocs(s)
}

// ParseSecretYAML はシークレットの YAML が決まった形（SealedSecret 1 つ・値は value の 1 つだけ）であることを確かめる
func ParseSecretYAML(name, src string) error {
	if !ValidName(name) {
		return fieldErr("name", "名前は英小文字で始め、英小文字・数字・ハイフンで 40 文字までにしてください")
	}
	docs, err := parseDocs(src)
	if err != nil {
		return err
	}
	var s k8sSealedSecret
	if n, err := decodeKind(src, "SealedSecret", &s); err != nil || n != 1 || len(docs) != 1 {
		return fieldErr("yaml", "シークレットの YAML は SealedSecret 1 つだけにしてください")
	}
	enc := s.Spec.EncryptedData[SecretValueKey]
	if !sealedRe.MatchString(enc) {
		return fieldErr("yaml", "encryptedData.%s がありません", SecretValueKey)
	}
	want, err := RenderSecretYAML(name, enc)
	if err != nil {
		return err
	}
	if wantDocs, _ := splitDocs(want); !reflect.DeepEqual(docs, wantDocs) {
		return fieldErr("yaml", "シークレットの YAML は、コンソールが作る形（SealedSecret %s・値は %s だけ）から変えられません", SecretObjectName(name), SecretValueKey)
	}
	return nil
}
