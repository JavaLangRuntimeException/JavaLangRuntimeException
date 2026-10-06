// Package handler はページビューの通知（navigator.sendBeacon）を受ける HTTP ハンドラ。
package handler

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/javalangruntimeexception/taramanji/backend/internal/analytics/domain/service"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/observability"
)

type PageviewHandler struct{ metrics observability.Metrics }

func NewPageviewHandler(m observability.Metrics) *PageviewHandler {
	return &PageviewHandler{metrics: m}
}

func (h *PageviewHandler) Register(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/metrics/pageview", h.pageview)
}

// pageview はブラウザがページを表示したら呼ばれる。Datadog の web.pageviews を 1 増やす（旧 API と同じタグ）
func (h *PageviewHandler) pageview(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Path string `json:"path"`
	}
	raw, _ := io.ReadAll(io.LimitReader(r.Body, 4<<10))
	_ = json.Unmarshal(raw, &body)
	if service.Counted(r.UserAgent(), body.Path) {
		host := r.Header.Get("X-Forwarded-Host")
		if host == "" {
			host = r.Host
		}
		h.metrics.Count("web.pageviews", 1, "page:"+service.PageOf(body.Path), "site:"+service.SiteOf(host))
	}
	w.WriteHeader(http.StatusNoContent)
}
