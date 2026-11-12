package usecase

import (
	"context"
	"fmt"
	"sort"
	"unicode/utf8"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/service"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/errs"
)

// シークレット: 値は Sealed Secrets の公開鍵で暗号化してからリポジトリに置く（コンソールは平文を保存も表示もしない）。
// 復号できるのはクラスターの中の Sealed Secrets だけ。コントローラーが、つないだ関数の namespace にだけ写す

func secretsOf(f service.FunctionSpec) []string { return f.SecretNames() }

func (u *ConsoleUsecaseImpl) sealer() (gateway.SecretSealer, error) {
	if u.d.Sealer == nil {
		return nil, errs.New(errs.ErrorTypeBadRequest, "この環境ではシークレットを作れません（Sealed Secrets がつながっていません）").WithCode("secrets_disabled")
	}
	return u.d.Sealer, nil
}

func (u *ConsoleUsecaseImpl) secretOf(f gateway.ResourceFile, st *gateway.SealedState, fns []string) *Secret {
	s := &Secret{Name: f.Name, Functions: fns, Status: "pending",
		Source: &Source{Yaml: f.YAML, Revision: f.Revision, URL: u.d.Apps.URL(gateway.KindSecrets, f.Name)}}
	if s.Functions == nil {
		s.Functions = []string{}
	}
	if err := service.ParseSecretYAML(f.Name, f.YAML); err != nil {
		s.Source.Problem = err.Error()
		s.Status = err.Error()
		return s
	}
	switch {
	case st == nil:
	case st.Synced:
		s.Status, s.Ready = service.StatusReady, true
	case st.Message != "":
		// 復号できない（別のクラスター・古い鍵で暗号化したものなど）。値を入れ直せば直る
		s.Status = "復号できません: " + st.Message
	}
	return s
}

// secretValue は値を確かめる（空・大きすぎる・UTF-8 でないものは置かない）
func secretValue(v string) ([]byte, error) {
	switch {
	case v == "":
		return nil, errs.NewValidationError("value", "値を入れてください").WithCode("invalid")
	case len(v) > service.MaxSecretBytes:
		return nil, errs.NewValidationError("value", fmt.Sprintf("値は %d KB までです", service.MaxSecretBytes>>10)).WithCode("invalid")
	case !utf8.ValidString(v):
		return nil, errs.NewValidationError("value", "値は UTF-8 の文字列にしてください").WithCode("invalid")
	}
	return []byte(v), nil
}

// sealSecret は値を暗号化して YAML にする（失敗しても値はエラーに入れない）
func (u *ConsoleUsecaseImpl) sealSecret(ctx context.Context, name, value string) (string, error) {
	sealer, err := u.sealer()
	if err != nil {
		return "", err
	}
	if !service.ValidName(name) {
		return "", invalid(service.ParseSecretYAML(name, ""))
	}
	b, err := secretValue(value)
	if err != nil {
		return "", err
	}
	enc, err := sealer.Seal(ctx, service.SecretObjectName(name), b)
	if err != nil {
		return "", errs.New(errs.ErrorTypeUpstream, "値を暗号化できませんでした（Sealed Secrets の公開鍵を読めません）").WithCode("seal_failed").WithCause(err)
	}
	y, err := service.RenderSecretYAML(name, enc)
	if err != nil {
		return "", errs.NewInternalError(err)
	}
	return y, nil
}

func (u *ConsoleUsecaseImpl) ListSecrets(ctx context.Context, _ ListSecretsInput) (*ListSecretsOutput, error) {
	store, err := u.store()
	if err != nil {
		return nil, err
	}
	files, err := store.List(ctx, gateway.KindSecrets)
	if err != nil {
		return nil, storeErr(err)
	}
	fns, err := u.functionSpecs(ctx)
	if err != nil {
		return nil, storeErr(err)
	}
	used := connectedBy(fns, secretsOf)
	// Sealed Secrets が復号できたか。読めなくても一覧は出す
	var states map[string]gateway.SealedState
	if u.d.Sealer != nil {
		states, _ = u.d.Sealer.Sealed(ctx)
	}
	out := &ListSecretsOutput{Secrets: []*Secret{}, Enabled: u.d.Sealer != nil}
	for _, f := range files {
		var st *gateway.SealedState
		if s, ok := states[service.SecretObjectName(f.Name)]; ok {
			st = &s
		}
		out.Secrets = append(out.Secrets, u.secretOf(f, st, used[f.Name]))
	}
	sort.Slice(out.Secrets, func(i, j int) bool { return out.Secrets[i].Name < out.Secrets[j].Name })
	return out, nil
}

func (u *ConsoleUsecaseImpl) CreateSecret(ctx context.Context, in CreateSecretInput) (*CreateSecretOutput, error) {
	store, err := u.store()
	if err != nil {
		return nil, err
	}
	y, err := u.sealSecret(ctx, in.Name, in.Value)
	if err != nil {
		return nil, err
	}
	rev, err := store.Put(ctx, gateway.KindSecrets, in.Name, y, "", u.commitMessage(ctx, "create", "secret", in.Name))
	if err != nil {
		return nil, storeErr(err)
	}
	return &CreateSecretOutput{Secret: u.secretOf(gateway.ResourceFile{Name: in.Name, YAML: y, Revision: rev}, nil, nil)}, nil
}

func (u *ConsoleUsecaseImpl) UpdateSecret(ctx context.Context, in UpdateSecretInput) (*UpdateSecretOutput, error) {
	store, err := u.store()
	if err != nil {
		return nil, err
	}
	// 版がなければ新しく作ることになってしまう（上書きのつもりで別の名前を作らない）
	if in.Revision == "" {
		return nil, errs.NewValidationError("revision", "上書きする版がありません。読み直してからやり直してください").WithCode("invalid")
	}
	y, err := u.sealSecret(ctx, in.Name, in.Value)
	if err != nil {
		return nil, err
	}
	rev, err := store.Put(ctx, gateway.KindSecrets, in.Name, y, in.Revision, u.commitMessage(ctx, "update", "secret", in.Name))
	if err != nil {
		return nil, storeErr(err)
	}
	fns, _ := u.functionSpecs(ctx)
	return &UpdateSecretOutput{Secret: u.secretOf(gateway.ResourceFile{Name: in.Name, YAML: y, Revision: rev}, nil, connectedBy(fns, secretsOf)[in.Name])}, nil
}

func (u *ConsoleUsecaseImpl) DeleteSecret(ctx context.Context, in DeleteSecretInput) error {
	store, err := u.store()
	if err != nil {
		return err
	}
	if !service.ValidName(in.Name) {
		return storeErr(gateway.ErrResourceNotFound)
	}
	fns, err := u.functionSpecs(ctx)
	if err != nil {
		return storeErr(err)
	}
	if used := connectedBy(fns, secretsOf)[in.Name]; len(used) > 0 {
		return errs.New(errs.ErrorTypeBadRequest, fmt.Sprintf("関数 %v がこのシークレットをつないでいます。先に関数から外してください", used)).WithCode("secret_in_use")
	}
	if err := store.Delete(ctx, gateway.KindSecrets, in.Name, in.Revision, u.commitMessage(ctx, "delete", "secret", in.Name)); err != nil {
		return storeErr(err)
	}
	return nil
}
