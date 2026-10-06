package usecase

import (
	"context"
	"strings"
	"testing"

	"github.com/javalangruntimeexception/taramanji/backend/internal/identity/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/identity/domain/service"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/auth"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/observability"
)

type fakeOIDC struct{ email string }

func (f fakeOIDC) AuthURL(redirect, state, challenge string) string {
	return "https://accounts.google.com/auth?redirect_uri=" + redirect + "&state=" + state
}
func (f fakeOIDC) Exchange(context.Context, string, string, string) (*gateway.Profile, error) {
	return &gateway.Profile{Email: f.email, Name: "Shuta"}, nil
}

func TestLoginFlow(t *testing.T) {
	t.Setenv("AUTH_SECRET", strings.Repeat("s", 40))
	t.Setenv("ADMIN_EMAIL", "admin@taramanji.com")
	hosts := service.ParseHosts("taramanji.com")
	ctx := context.Background()

	uc := NewIdentityUsecase(fakeOIDC{email: "Admin@taramanji.com"}, hosts, observability.Noop{}, nil)
	if _, _, err := uc.BeginLogin("evil.example.com", true, "/admin"); err != ErrUnknownHost {
		t.Fatalf("err %v", err)
	}
	target, flow, err := uc.BeginLogin("taramanji.com", true, "https://evil.example.com/x")
	if err != nil || !strings.Contains(target, "redirect_uri=https://taramanji.com/api/auth/callback/google") || flow.Callback != "/x" {
		t.Fatalf("target %s flow %+v err %v", target, flow, err)
	}
	// state が違えば拒否
	res, _ := uc.FinishLogin(ctx, "taramanji.com", true, flow, "forged", "code", "")
	if res.Token != "" || res.Redirect != "/admin/login?error=AccessDenied" {
		t.Fatalf("res %+v", res)
	}
	res, err = uc.FinishLogin(ctx, "taramanji.com", true, flow, flow.State, "code", "")
	if err != nil || res.Token == "" || res.Redirect != "/x" {
		t.Fatalf("res %+v err %v", res, err)
	}
	u, err := auth.Parse(res.Token)
	if err != nil || u.Email != "Admin@taramanji.com" {
		t.Fatalf("user %+v %v", u, err)
	}

	// 許可されていないアカウント
	other := NewIdentityUsecase(fakeOIDC{email: "someone@gmail.com"}, hosts, observability.Noop{}, nil)
	_, flow2, _ := other.BeginLogin("taramanji.com", true, "")
	res, _ = other.FinishLogin(ctx, "taramanji.com", true, flow2, flow2.State, "code", "")
	if res.Token != "" || !strings.Contains(res.Redirect, "AccessDenied") {
		t.Fatalf("res %+v", res)
	}
}
