// Package service はアクセス数（ページビュー）の数え方のルール。
package service

import (
	"regexp"
	"strings"
)

// pages はタグに使う既知のページ（任意の URL でタグが増え続けると Datadog の課金が膨らむ）
var pages = map[string]bool{"/": true, "/link": true, "/blogs": true, "/portfolio": true, "/contact": true, "/reserve": true,
	"/location": true, "/questionnaire": true, "/privacy": true, "/calendar-sync": true}

var bot = regexp.MustCompile(`(?i)bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|curl|wget|python-requests`)

// IsBot はボット・監視・プレビューのアクセスか
func IsBot(userAgent string) bool { return bot.MatchString(userAgent) }

// PageOf はパスの最初の階層をページ名にする（既知のページ以外は other）
func PageOf(path string) string {
	path, _, _ = strings.Cut(path, "?")
	parts := strings.SplitN(path, "/", 3)
	first := "/"
	if len(parts) > 1 {
		first += parts[1]
	}
	if pages[first] {
		return first
	}
	return "other"
}

// SiteOf は本番のホスト（www を除く）なら taramanji.com、それ以外（確認用・ローカル）は other
func SiteOf(host string) string {
	host, _, _ = strings.Cut(host, ":")
	if strings.TrimPrefix(host, "www.") == "taramanji.com" {
		return "taramanji.com"
	}
	return "other"
}

// Counted は数えるか（ボットと管理画面は数えない）
func Counted(userAgent, path string) bool {
	return !IsBot(userAgent) && !strings.HasPrefix(path, "/admin")
}
