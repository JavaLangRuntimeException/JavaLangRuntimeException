package handler

import (
	"encoding/base64"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"

	"github.com/javalangruntimeexception/taramanji/backend/internal/identity/domain/service"
	"github.com/javalangruntimeexception/taramanji/backend/internal/identity/usecase"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/auth"
)

const flowCookie = "taramanji_oauth"

// AuthHandlers は旧 NextAuth と同じ URL（/api/auth/...）でログイン・ログアウトを受ける。
// Google に登録済みのリダイレクト URI（/api/auth/callback/google）を変えずに済む
type AuthHandlers struct {
	uc *usecase.IdentityUsecaseImpl
	// secure は本番（https）なら true。Cookie の Secure 属性とリダイレクト URI の scheme に使う
	secure bool
}

func NewAuthHandlers(uc *usecase.IdentityUsecaseImpl, secure bool) *AuthHandlers {
	return &AuthHandlers{uc: uc, secure: secure}
}

func (h *AuthHandlers) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/auth/signin/google", h.signin)
	mux.HandleFunc("POST /api/auth/signin/google", h.signin)
	mux.HandleFunc("GET /api/auth/callback/google", h.callback)
	mux.HandleFunc("POST /api/auth/signout", h.signout)
	mux.HandleFunc("GET /api/auth/signout", h.signout)
}

// host は Gateway（Envoy）が渡す元のホスト名
func host(r *http.Request) string {
	h := r.Header.Get("X-Forwarded-Host")
	if h == "" {
		h = r.Host
	}
	h, _, _ = strings.Cut(h, ",")
	if i := strings.LastIndex(h, ":"); i > 0 && !strings.Contains(h[i:], "]") {
		h = h[:i]
	}
	return strings.TrimSpace(h)
}

func (h *AuthHandlers) setFlow(w http.ResponseWriter, f *usecase.Flow) {
	raw, _ := json.Marshal(f)
	http.SetCookie(w, &http.Cookie{Name: flowCookie, Value: base64.RawURLEncoding.EncodeToString(raw), Path: "/api/auth/",
		MaxAge: 600, HttpOnly: true, Secure: h.secure, SameSite: http.SameSiteLaxMode})
}

func (h *AuthHandlers) takeFlow(w http.ResponseWriter, r *http.Request) *usecase.Flow {
	c, err := r.Cookie(flowCookie)
	http.SetCookie(w, &http.Cookie{Name: flowCookie, Value: "", Path: "/api/auth/", MaxAge: -1, HttpOnly: true, Secure: h.secure, SameSite: http.SameSiteLaxMode})
	if err != nil {
		return nil
	}
	raw, err := base64.RawURLEncoding.DecodeString(c.Value)
	if err != nil {
		return nil
	}
	var f usecase.Flow
	if json.Unmarshal(raw, &f) != nil {
		return nil
	}
	return &f
}

func (h *AuthHandlers) signin(w http.ResponseWriter, r *http.Request) {
	target, flow, err := h.uc.BeginLogin(host(r), h.secure, r.FormValue("callbackUrl"))
	if err != nil {
		http.Error(w, "login is not available on this host", http.StatusNotFound)
		return
	}
	h.setFlow(w, flow)
	http.Redirect(w, r, target, http.StatusFound)
}

func (h *AuthHandlers) callback(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	res, err := h.uc.FinishLogin(r.Context(), host(r), h.secure, h.takeFlow(w, r), q.Get("state"), q.Get("code"), q.Get("error"))
	if err != nil {
		slog.ErrorContext(r.Context(), "login failed", "error", err)
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
