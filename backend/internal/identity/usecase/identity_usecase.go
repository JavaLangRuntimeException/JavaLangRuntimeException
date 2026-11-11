package usecase

import (
	"context"
	"errors"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/identity/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/identity/domain/service"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/auth"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/observability"
)

// ErrNoAccessToken は Cloudflare Access を通っていないリクエスト（トークンが無い）
var ErrNoAccessToken = errors.New("no Cloudflare Access token")

type IdentityUsecaseImpl struct {
	access  gateway.AccessVerifier
	metrics observability.Metrics
	clock   func() time.Time
}

var _ IdentityUsecase = (*IdentityUsecaseImpl)(nil)

func NewIdentityUsecase(a gateway.AccessVerifier, m observability.Metrics, clock func() time.Time) *IdentityUsecaseImpl {
	if clock == nil {
		clock = time.Now
	}
	return &IdentityUsecaseImpl{access: a, metrics: m, clock: clock}
}

// GetSession はログイン中の管理者（SessionInterceptor が Cookie から取り出したもの）。未ログインなら User は nil
func (u *IdentityUsecaseImpl) GetSession(ctx context.Context, _ GetSessionInput) (*GetSessionOutput, error) {
	s := auth.UserFrom(ctx)
	if s == nil || !auth.IsAllowedAdmin(s.Email) {
		return &GetSessionOutput{}, nil
	}
	return &GetSessionOutput{User: &User{Email: s.Email, Name: s.Name, Picture: s.Picture}}, nil
}

// LoginResult はログインの結果。Token が空なら Redirect（ログイン画面とエラー）へ戻す
type LoginResult struct {
	Token    string
	Redirect string
}

// LoginWithAccess は Cloudflare Access のトークンを検証し、許可された管理者ならセッションの JWT を作る。
// ログインは Cloudflare Access（Google などの IdP とポリシー）だけに任せ、アプリでは改めて Google へ行かない。
// セッションは Access のトークンの期限までにして、Access のセッションより長く残らないようにする
func (u *IdentityUsecaseImpl) LoginWithAccess(ctx context.Context, token, callback string) (*LoginResult, error) {
	denied := &LoginResult{Redirect: "/admin/login?error=" + service.AccessDenied}
	if token == "" {
		u.metrics.Count("identity.login", 1, "status:denied", "reason:no_access_token")
		return nil, ErrNoAccessToken
	}
	id, err := u.access.Verify(ctx, token)
	if err != nil {
		u.metrics.Count("identity.login", 1, "status:denied", "reason:invalid_access_token")
		return nil, err
	}
	// Access のポリシーに加えて、アプリでも ADMIN_EMAIL を確かめる（Access の設定を誤っても管理者を広げない）
	if !auth.IsAllowedAdmin(id.Email) {
		u.metrics.Count("identity.login", 1, "status:denied", "reason:not_allowed")
		return denied, nil
	}
	token, err = auth.SignUntil(auth.User{Email: id.Email}, u.clock(), id.Expiry)
	if err != nil {
		return nil, err
	}
	u.metrics.Count("identity.login", 1, "status:ok")
	return &LoginResult{Token: token, Redirect: service.SafeCallback(callback, "/admin")}, nil
}
