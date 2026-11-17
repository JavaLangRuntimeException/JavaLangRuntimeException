package service

import (
	"errors"
	"reflect"
	"strings"
	"testing"
)

func TestSecretYAML(t *testing.T) {
	y, err := RenderSecretYAML("anthropic", "QUJD+/==")
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"apiVersion: bitnami.com/v1alpha1", "kind: SealedSecret", "name: secret-anthropic",
		"cloud.taramanji.com/kind: secret", "cloud.taramanji.com/secret: anthropic", "value: QUJD+/==", "type: Opaque"} {
		if !strings.Contains(y, want) {
			t.Errorf("YAML に %q がない:\n%s", want, y)
		}
	}
	if strings.Contains(y, "namespace:") {
		t.Errorf("namespace は書かない（共有の namespace に入る）:\n%s", y)
	}
	if err := ParseSecretYAML("anthropic", y); err != nil {
		t.Fatal(err)
	}

	for name, bad := range map[string]string{
		"別の名前":        strings.ReplaceAll(y, "secret-anthropic", "secret-other"),
		"値が 2 つ":      strings.Replace(y, "    value: QUJD+/==\n", "    value: QUJD+/==\n    extra: QUJD\n", 1),
		"値がない":        strings.Replace(y, "value: QUJD+/==", "other: QUJD+/==", 1),
		"namespace":   strings.Replace(y, "  name: secret-anthropic\n", "  name: secret-anthropic\n  namespace: kube-system\n", 1),
		"型を変える":       strings.Replace(y, "type: Opaque", "type: kubernetes.io/dockerconfigjson", 1),
		"2 つ目のもの":     y + "---\napiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: anthropic\n",
		"Secret そのもの": "apiVersion: v1\nkind: Secret\nmetadata:\n  name: secret-anthropic\nstringData:\n  value: plain\n",
	} {
		if bad == y {
			t.Fatalf("%s: 置き換えられていない", name)
		}
		if err := ParseSecretYAML("anthropic", bad); err == nil {
			t.Errorf("%s は通さない", name)
		}
	}
	if err := ParseSecretYAML("Bad", y); err == nil {
		t.Error("名前の決まりに合わないものは通さない")
	}
}

func TestFunctionSecrets(t *testing.T) {
	s := validSpec()
	s.Secrets = []SecretRef{{Env: "ANTHROPIC_API_KEY", Secret: "anthropic"}, {Env: " APP_PASSCODE ", Secret: "passcode"}, {Env: "KEY2", Secret: "anthropic"}}
	s = s.Normalize()
	if err := s.Validate(); err != nil {
		t.Fatal(err)
	}
	if got := s.SecretNames(); !reflect.DeepEqual(got, []string{"anthropic", "passcode"}) {
		t.Fatalf("SecretNames %v", got)
	}
	y, err := RenderFunctionYAML(s, testNS)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"secretKeyRef:", "name: secret-anthropic", "key: value", "secrets: anthropic,passcode", "name: APP_PASSCODE"} {
		if !strings.Contains(y, want) {
			t.Errorf("YAML に %q がない:\n%s", want, y)
		}
	}
	p, err := ParseFunctionYAML("blog", y, testNS)
	if err != nil || !p.FormEditable || !reflect.DeepEqual(p.Spec, s) {
		t.Fatalf("読み戻し: %+v %v", p, err)
	}

	// シークレットなしの関数の登録には secrets を書かない（前からある YAML を変えない）
	plain := validSpec()
	if _, ok := plain.RegistrationData()[RegistrationSecrets]; ok {
		t.Error("シークレットがなければ secrets は書かない")
	}
	py, _ := RenderFunctionYAML(plain, testNS)
	if strings.Contains(py, "secrets:") || strings.Contains(py, "valueFrom") {
		t.Errorf("シークレットなし:\n%s", py)
	}
	// 空の値の環境変数も value: "" を書く（前と同じ YAML）
	empty := validSpec()
	empty.Env = []EnvVar{{Name: "EMPTY"}}
	ey, _ := RenderFunctionYAML(empty, testNS)
	if !strings.Contains(ey, "value: \"\"") {
		t.Errorf("空の値:\n%s", ey)
	}
	if p, err := ParseFunctionYAML("blog", ey, testNS); err != nil || !p.FormEditable {
		t.Fatalf("空の値の読み戻し: %+v %v", p, err)
	}

	// 登録にないシークレットを読む・ほかの Secret を読む YAML は通さない
	for name, bad := range map[string]string{
		"登録にない":          strings.Replace(y, "secrets: anthropic,passcode", "secrets: anthropic", 1),
		"イメージの認証情報":      strings.Replace(y, "name: secret-passcode", "name: cloud-registry", 1),
		"データベースの Secret": strings.Replace(y, "name: secret-passcode", "name: db-main", 1),
		"別のキー":           strings.Replace(y, "key: value", "key: other", 1),
	} {
		if bad == y {
			t.Fatalf("%s: 置き換えられていない", name)
		}
		if _, err := ParseFunctionYAML("blog", bad, testNS); err == nil {
			t.Errorf("%s は通さない", name)
		}
	}

	// fieldRef など、シークレット以外の valueFrom は入れられるが、フォームでは扱わない
	fieldRef := strings.Replace(y, "            - name: KEY2\n", "            - name: POD\n              valueFrom:\n                fieldRef:\n                  fieldPath: metadata.name\n            - name: KEY2\n", 1)
	if p, err := ParseFunctionYAML("blog", fieldRef, testNS); fieldRef == y || err != nil || p.FormEditable {
		t.Fatalf("fieldRef: %+v %v", p, err)
	}

	for name, mutate := range map[string]func(*FunctionSpec){
		"env と重複":  func(s *FunctionSpec) { s.Secrets[0].Env = "MODE" },
		"名前が正しくない": func(s *FunctionSpec) { s.Secrets[0].Env = "1KEY" },
		"シークレット名":  func(s *FunctionSpec) { s.Secrets[0].Secret = "Bad" },
		"多すぎる": func(s *FunctionSpec) {
			for i := range MaxFunctionSecrets {
				s.Secrets = append(s.Secrets, SecretRef{Env: "K" + string(rune('A'+i)), Secret: "x"})
			}
		},
	} {
		bad := s
		bad.Secrets = append([]SecretRef(nil), s.Secrets...)
		mutate(&bad)
		var fe *FieldError
		if err := bad.Validate(); !errors.As(err, &fe) || fe.Field != "secrets" {
			t.Errorf("%s: %v", name, err)
		}
	}

	reg, ok := ParseRegistration("blog", s.RegistrationData())
	if !ok || !reflect.DeepEqual(reg.Secrets, []string{"anthropic", "passcode"}) {
		t.Fatalf("登録: %+v %v", reg, ok)
	}
	data := s.RegistrationData()
	data[RegistrationSecrets] = "anthropic,Bad"
	if _, ok := ParseRegistration("blog", data); ok {
		t.Error("名前の決まりに合わないシークレットの登録は読まない")
	}
}
