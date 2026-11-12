package usecase

import (
	"context"
	"encoding/base64"
	"errors"
	"strings"
	"testing"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/service"
)

// fakeSealer は値を「名前:値」の base64 にする（本物は Sealed Secrets の公開鍵で暗号化する）。sealed は覚えた値
type fakeSealer struct {
	sealed map[string]string
	states map[string]gateway.SealedState
	err    error
}

func (f *fakeSealer) Seal(_ context.Context, objectName string, value []byte) (string, error) {
	if f.err != nil {
		return "", f.err
	}
	f.sealed[objectName] = string(value)
	return base64.StdEncoding.EncodeToString([]byte("sealed:" + objectName)), nil
}

func (f *fakeSealer) Sealed(context.Context) (map[string]gateway.SealedState, error) {
	return f.states, nil
}

func TestSecrets(t *testing.T) {
	uc, store, _ := newComputeUC()
	ctx := context.Background()

	// Sealed Secrets がつながっていなければ作れない
	if _, err := uc.CreateSecret(ctx, CreateSecretInput{Name: "anthropic", Value: "sk-1"}); code(err) != "secrets_disabled" {
		t.Fatalf("disabled: %v", err)
	}
	sealer := &fakeSealer{sealed: map[string]string{}, states: map[string]gateway.SealedState{}}
	uc.d.Sealer = sealer
	if opts, _ := uc.GetHostingOptions(ctx, GetHostingOptionsInput{}); !opts.SecretsEnabled {
		t.Fatal("secrets_enabled")
	}

	made, err := uc.CreateSecret(ctx, CreateSecretInput{Name: "anthropic", Value: "sk-ant-平文"})
	if err != nil || made.Secret.Name != "anthropic" || made.Secret.Ready || made.Secret.Status != "pending" {
		t.Fatalf("create: %+v %v", made, err)
	}
	// リポジトリには暗号化したものだけ（平文は残らない）。暗号は共有の namespace の secret-<名前> に結びつける
	y := store.files["secrets/anthropic"].YAML
	if strings.Contains(y, "sk-ant") || !strings.Contains(y, "kind: SealedSecret") || sealer.sealed["secret-anthropic"] != "sk-ant-平文" {
		t.Fatalf("YAML:\n%s", y)
	}
	if store.messages[len(store.messages)-1] != "create(prod): secret anthropic (by )" {
		t.Fatalf("commit: %s", store.messages[len(store.messages)-1])
	}
	for name, in := range map[string]CreateSecretInput{
		"空":        {Name: "x", Value: ""},
		"大きすぎる":    {Name: "x", Value: strings.Repeat("a", service.MaxSecretBytes+1)},
		"名前":       {Name: "Bad", Value: "v"},
		"UTF-8 以外": {Name: "x", Value: "\xff"},
	} {
		if _, err := uc.CreateSecret(ctx, in); code(err) != "invalid" {
			t.Errorf("%s: %v", name, err)
		}
	}
	if _, err := uc.CreateSecret(ctx, CreateSecretInput{Name: "anthropic", Value: "v"}); code(err) != "conflict" {
		t.Fatalf("同じ名前: %v", err)
	}
	// 暗号化できなければ置かない。エラーに値を入れない
	sealer.err = errors.New("cert unavailable")
	if _, err := uc.CreateSecret(ctx, CreateSecretInput{Name: "other", Value: "do-not-leak"}); code(err) != "seal_failed" || strings.Contains(err.Error(), "do-not-leak") {
		t.Fatalf("seal_failed: %v", err)
	}
	sealer.err = nil
	if _, ok := store.files["secrets/other"]; ok {
		t.Fatal("暗号化できなかったものを置いてはいけない")
	}

	// 関数につなぐ。ないシークレットはつなげない
	spec := blogSpec()
	spec.Secrets = []*SecretEnv{{Name: "ANTHROPIC_API_KEY", Secret: "none"}}
	if _, err := uc.ApplyFunction(ctx, ApplyFunctionInput{Spec: spec}); code(err) != "invalid" {
		t.Fatalf("ないシークレット: %v", err)
	}
	spec.Secrets[0].Secret = "anthropic"
	fn, err := uc.ApplyFunction(ctx, ApplyFunctionInput{Spec: spec})
	if err != nil || !strings.Contains(fn.Function.Source.Yaml, "name: secret-anthropic") || !fn.Function.Source.FormEditable ||
		len(fn.Function.Spec.Secrets) != 1 || fn.Function.Spec.Secrets[0].Name != "ANTHROPIC_API_KEY" {
		t.Fatalf("function: %+v %v", fn, err)
	}

	// 一覧: つないでいる関数と、Sealed Secrets が復号できたか
	sealer.states["secret-anthropic"] = gateway.SealedState{Synced: true}
	if _, err := uc.CreateSecret(ctx, CreateSecretInput{Name: "broken", Value: "v"}); err != nil {
		t.Fatal(err)
	}
	sealer.states["secret-broken"] = gateway.SealedState{Message: "no key could decrypt secret (value)"}
	list, err := uc.ListSecrets(ctx, ListSecretsInput{})
	if err != nil || !list.Enabled || len(list.Secrets) != 2 {
		t.Fatalf("list: %+v %v", list, err)
	}
	a, b := list.Secrets[0], list.Secrets[1]
	if a.Name != "anthropic" || !a.Ready || a.Functions[0] != "blog" || b.Ready || !strings.Contains(b.Status, "復号できません") || len(b.Functions) != 0 {
		t.Fatalf("list: %+v %+v", a, b)
	}

	// 上書き: 版が要る。値は新しく暗号化する
	if _, err := uc.UpdateSecret(ctx, UpdateSecretInput{Name: "anthropic", Value: "sk-2"}); code(err) != "invalid" {
		t.Fatalf("版なし: %v", err)
	}
	up, err := uc.UpdateSecret(ctx, UpdateSecretInput{Name: "anthropic", Value: "sk-2", Revision: a.Source.Revision})
	if err != nil || sealer.sealed["secret-anthropic"] != "sk-2" || up.Secret.Source.Revision == a.Source.Revision || up.Secret.Functions[0] != "blog" {
		t.Fatalf("update: %+v %v", up, err)
	}
	if _, err := uc.UpdateSecret(ctx, UpdateSecretInput{Name: "anthropic", Value: "sk-3", Revision: a.Source.Revision}); code(err) != "conflict" {
		t.Fatalf("古い版: %v", err)
	}

	// 関数がつないでいるシークレットは消せない
	if err := uc.DeleteSecret(ctx, DeleteSecretInput{Name: "anthropic", Revision: store.files["secrets/anthropic"].Revision}); code(err) != "secret_in_use" {
		t.Fatalf("secret_in_use: %v", err)
	}
	if err := uc.DeleteSecret(ctx, DeleteSecretInput{Name: "broken", Revision: store.files["secrets/broken"].Revision}); err != nil {
		t.Fatal(err)
	}

	// 手で push した壊れた YAML も一覧に出す（理由つき）
	store.files["secrets/hand"] = gateway.ResourceFile{Name: "hand", YAML: "apiVersion: v1\nkind: Secret\nmetadata:\n  name: secret-hand\n", Revision: "rx"}
	list, _ = uc.ListSecrets(ctx, ListSecretsInput{})
	if len(list.Secrets) != 2 || list.Secrets[1].Name != "hand" || list.Secrets[1].Source.Problem == "" || list.Secrets[1].Ready {
		t.Fatalf("壊れた YAML: %+v", list.Secrets)
	}
}
