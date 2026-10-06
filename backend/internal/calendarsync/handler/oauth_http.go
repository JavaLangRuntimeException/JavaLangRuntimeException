package handler

import (
	"context"
	"log/slog"
	"net/http"
	"net/url"

	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/auth"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/errs"
)

// OAuthFlow はアカウント接続の 2 段階（同意画面へ送る・戻ってきたら保存）
type OAuthFlow interface {
	StartConnect(ctx context.Context, hint string) (string, error)
	FinishConnect(ctx context.Context, state, code string) (string, error)
}

// OAuthHandlers は Google の OAuth クライアントに登録済みの URL（/api/calendar-sync/connect・callback）を
// そのまま受ける HTTP ハンドラ。ブラウザのリダイレクトなので RPC ではなく HTTP で受ける
type OAuthHandlers struct {
	flow    OAuthFlow
	siteURL string // https://gws.taramanji.com（戻り先の管理画面）
	errors  errs.ErrorWriter
}

func NewOAuthHandlers(flow OAuthFlow, siteURL string) *OAuthHandlers {
	return &OAuthHandlers{flow: flow, siteURL: siteURL, errors: errs.NewErrorWriter()}
}

func (h *OAuthHandlers) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/calendar-sync/connect", h.connect)
	mux.HandleFunc("GET /api/calendar-sync/callback", h.callback)
}

func (h *OAuthHandlers) admin(w http.ResponseWriter, r *http.Request) bool {
	if _, err := auth.CheckAdmin(r.Header); err != nil {
		h.errors.WriteError(w, r, err)
		return false
	}
	return true
}

// connect は Google の同意画面へ。?hint=メールアドレス で選ぶアカウントを指定できる
func (h *OAuthHandlers) connect(w http.ResponseWriter, r *http.Request) {
	if !h.admin(w, r) {
		return
	}
	target, err := h.flow.StartConnect(r.Context(), r.URL.Query().Get("hint"))
	if err != nil {
		h.errors.WriteError(w, r, errs.NewInternalError(err))
		return
	}
	http.Redirect(w, r, target, http.StatusFound)
}

func (h *OAuthHandlers) back(w http.ResponseWriter, r *http.Request, key, value string) {
	http.Redirect(w, r, h.siteURL+"/admin?"+url.Values{key: {value}}.Encode(), http.StatusFound)
}

// callback は Google から戻ってきたら更新トークンを暗号化して保存し、管理画面へ戻す
func (h *OAuthHandlers) callback(w http.ResponseWriter, r *http.Request) {
	if !h.admin(w, r) {
		return
	}
	q := r.URL.Query()
	if e := q.Get("error"); e != "" {
		h.back(w, r, "error", "Google: "+e)
		return
	}
	id, err := h.flow.FinishConnect(r.Context(), q.Get("state"), q.Get("code"))
	if err != nil {
		slog.ErrorContext(r.Context(), "calendar sync connect failed", "error", err)
		msg := []rune(err.Error())
		if len(msg) > 200 {
			msg = msg[:200]
		}
		h.back(w, r, "error", string(msg))
		return
	}
	h.back(w, r, "connected", id)
}
