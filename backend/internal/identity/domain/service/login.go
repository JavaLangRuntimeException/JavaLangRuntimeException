// Package service はログインのドメインルール（戻り先の検証）。
package service

import (
	"net/url"
	"strings"
)

// AccessDenied は許可されていないアカウントでログインしたときのエラー（旧 NextAuth と同じ値。ログイン画面が見る）
const AccessDenied = "AccessDenied"

// SafeCallback はログイン後の戻り先。オープンリダイレクトを防ぐため、同じサイト内のパスだけを許す
func SafeCallback(raw, fallback string) string {
	if raw == "" {
		return fallback
	}
	// NextAuth は絶対 URL（https://taramanji.com/admin）も受けていたので、パスだけ取り出す
	if u, err := url.Parse(raw); err == nil && u.IsAbs() {
		raw = u.RequestURI()
	}
	if !strings.HasPrefix(raw, "/") || strings.HasPrefix(raw, "//") || strings.HasPrefix(raw, "/\\") || strings.ContainsAny(raw, "\r\n") {
		return fallback
	}
	return raw
}
