package handler

import (
	"log/slog"
	"net/http"

	"github.com/javalangruntimeexception/taramanji/backend/internal/identity/domain/service"
	"github.com/javalangruntimeexception/taramanji/backend/internal/identity/usecase"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/auth"
)

const (
	// Cloudflare Access が、守っているパスへのリクエストに付けるヘッダー
	accessHeader = "Cf-Access-Jwt-Assertion"
	// Access のログイン後にブラウザが持つ Cookie（ヘッダーが付かないパスでも、同じホストなら届く）
	accessCookie = "CF_Authorization"
)

// AuthHandlers は旧 NextAuth と同じ /api/auth/... でログイン・ログアウトを受ける。
// ログインは Cloudflare Access だけ（Access を通ったトークンを検証して、アプリのセッションに替える）
type AuthHandlers struct {
	uc *usecase.IdentityUsecaseImpl
	// secure は本番（https）なら true。Cookie の Secure 属性に使う
	secure bool
}

func NewAuthHandlers(uc *usecase.IdentityUsecaseImpl, secure bool) *AuthHandlers {
	return &AuthHandlers{uc: uc, secure: secure}
}

func (h *AuthHandlers) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/auth/signin/access", h.signin)
	mux.HandleFunc("POST /api/auth/signout", h.signout)
	mux.HandleFunc("GET /api/auth/signout", h.signout)
}

func accessToken(r *http.Request) string {
	if t := r.Header.Get(accessHeader); t != "" {
		return t
	}
	if c, err := r.Cookie(accessCookie); err == nil {
		return c.Value
	}
	return ""
}

func (h *AuthHandlers) signin(w http.ResponseWriter, r *http.Request) {
	res, err := h.uc.LoginWithAccess(r.Context(), accessToken(r), r.FormValue("callbackUrl"))
	if err != nil {
		slog.WarnContext(r.Context(), "login failed", "error", err)
		http.Redirect(w, r, "/admin/login?error=Callback", http.StatusFound)
		return
	}
	if res.Token != "" {
		http.SetCookie(w, auth.SessionCookie(res.Token, h.secure))
	}
	http.Redirect(w, r, res.Redirect, http.StatusFound)
}

// signout は Cookie を消す。?callbackUrl= があればそこへ戻し、なければ 204
func (h *AuthHandlers) signout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, auth.ClearSessionCookie(h.secure))
	if cb := r.FormValue("callbackUrl"); cb != "" {
		http.Redirect(w, r, service.SafeCallback(cb, "/"), http.StatusSeeOther)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
