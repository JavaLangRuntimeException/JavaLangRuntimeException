package usecase

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/identity/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/auth"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/observability"
)

type fakeAccess struct {
	email  string
	expiry time.Time
	err    error
}

func (f fakeAccess) Verify(_ context.Context, token string) (*gateway.Identity, error) {
	if f.err != nil {
		return nil, f.err
	}
	return &gateway.Identity{Email: f.email, Expiry: f.expiry}, nil
}

func TestLoginWithAccess(t *testing.T) {
	t.Setenv("AUTH_SECRET", strings.Repeat("s", 40))
	t.Setenv("ADMIN_EMAIL", "admin@taramanji.com")
	ctx := context.Background()
	now := time.Date(2026, 11, 7, 0, 0, 0, 0, time.UTC)
	clock := func() time.Time { return now }
	accessExp := now.Add(24 * time.Hour)

	uc := NewIdentityUsecase(fakeAccess{email: "Admin@taramanji.com", expiry: accessExp}, observability.Noop{}, clock)

	// Access のトークンが無い（Access を通っていない）
	if _, err := uc.LoginWithAccess(ctx, "", "/admin"); !errors.Is(err, ErrNoAccessToken) {
		t.Fatalf("err %v", err)
	}

	// 外のサイトへは戻さない
	res, err := uc.LoginWithAccess(ctx, "token", "https://evil.example.com/x")
	if err != nil || res.Token == "" || res.Redirect != "/x" {
		t.Fatalf("res %+v err %v", res, err)
	}
	u, err := auth.Parse(res.Token)
	if err != nil || u.Email != "Admin@taramanji.com" {
		t.Fatalf("user %+v %v", u, err)
	}

	// 検証に失敗したトークン
	bad := NewIdentityUsecase(fakeAccess{err: errors.New("bad signature")}, observability.Noop{}, clock)
	if _, err := bad.LoginWithAccess(ctx, "token", "/admin"); err == nil {
		t.Fatal("want error")
	}

	// Access は通ったが ADMIN_EMAIL ではないアカウント
	other := NewIdentityUsecase(fakeAccess{email: "someone@gmail.com", expiry: accessExp}, observability.Noop{}, clock)
	res, err = other.LoginWithAccess(ctx, "token", "/admin")
	if err != nil || res.Token != "" || res.Redirect != "/admin/login?error=AccessDenied" {
		t.Fatalf("res %+v err %v", res, err)
	}
}
