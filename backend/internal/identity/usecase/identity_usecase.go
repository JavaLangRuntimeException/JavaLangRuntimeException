package usecase

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/identity/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/identity/domain/service"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/auth"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/observability"
)

// ErrUnknownHost はリダイレクト URI を登録していないホストからのログイン
var ErrUnknownHost = errors.New("login is not allowed on this host")

type IdentityUsecaseImpl struct {
	oidc    gateway.OIDC
	hosts   service.Hosts
	metrics observability.Metrics
	clock   func() time.Time
}

var _ IdentityUsecase = (*IdentityUsecaseImpl)(nil)

func NewIdentityUsecase(o gateway.OIDC, hosts service.Hosts, m observability.Metrics, clock func() time.Time) *IdentityUsecaseImpl {
	if clock == nil {
		clock = time.Now
	}
	return &IdentityUsecaseImpl{oidc: o, hosts: hosts, metrics: m, clock: clock}
}

// GetSession はログイン中の管理者（SessionInterceptor が Cookie から取り出したもの）。未ログインなら User は nil
func (u *IdentityUsecaseImpl) GetSession(ctx context.Context, _ GetSessionInput) (*GetSessionOutput, error) {
	s := auth.UserFrom(ctx)
	if s == nil || !auth.IsAllowedAdmin(s.Email) {
		return &GetSessionOutput{}, nil
	}
	return &GetSessionOutput{User: &User{Email: s.Email, Name: s.Name, Picture: s.Picture}}, nil
}

// Flow はログインの途中状態（Cookie に入れてコールバックで照合する）
type Flow struct {
	State    string `json:"s"`
	Verifier string `json:"v"`
	Callback string `json:"c"`
}

func random(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

// BeginLogin は Google のログイン画面の URL と、照合用の途中状態を返す
func (u *IdentityUsecaseImpl) BeginLogin(host string, secure bool, callback string) (string, *Flow, error) {
	redirect := u.hosts.RedirectURI(host, secure)
	if redirect == "" {
		return "", nil, ErrUnknownHost
	}
	f := &Flow{State: random(32), Verifier: random(64), Callback: service.SafeCallback(callback, "/admin")}
	sum := sha256.Sum256([]byte(f.Verifier))
	return u.oidc.AuthURL(redirect, f.State, base64.RawURLEncoding.EncodeToString(sum[:])), f, nil
}

// LoginResult はコールバックの結果。Token が空なら Redirect（ログイン画面とエラー）へ戻す
type LoginResult struct {
	Token    string
	Redirect string
}

// FinishLogin は Google から戻ってきたら、許可された管理者ならセッションの JWT を作る
func (u *IdentityUsecaseImpl) FinishLogin(ctx context.Context, host string, secure bool, flow *Flow, state, code, googleErr string) (*LoginResult, error) {
	denied := &LoginResult{Redirect: "/admin/login?error=" + service.AccessDenied}
	if googleErr != "" || flow == nil || state == "" || state != flow.State {
		u.metrics.Count("identity.login", 1, "status:denied", "reason:state")
		return denied, nil
	}
	redirect := u.hosts.RedirectURI(host, secure)
	if redirect == "" {
		return nil, ErrUnknownHost
	}
	p, err := u.oidc.Exchange(ctx, redirect, code, flow.Verifier)
	if err != nil {
		u.metrics.Count("identity.login", 1, "status:failed")
		return nil, err
	}
	// 許可されたメールアドレスのみ（旧 NextAuth の signIn コールバックと同じ）
	if !auth.IsAllowedAdmin(p.Email) {
		u.metrics.Count("identity.login", 1, "status:denied", "reason:not_allowed")
		return denied, nil
	}
	token, err := auth.Sign(auth.User{Email: p.Email, Name: p.Name, Picture: p.Picture}, u.clock())
	if err != nil {
		return nil, err
	}
	u.metrics.Count("identity.login", 1, "status:ok")
	return &LoginResult{Token: token, Redirect: flow.Callback}, nil
}
