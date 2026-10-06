package service

import (
	"net/url"
	"regexp"
	"strings"
)

// mapsHosts は場所名を調べに行ってよいホスト（Google マップの共有リンクとその転送先）。
// 旧実装は任意の URL を取得していた（SSRF）ため、Google マップに限る。
var mapsHosts = []string{
	"maps.app.goo.gl", "goo.gl", "g.co", "maps.google.com", "www.google.com", "google.com",
	"www.google.co.jp", "google.co.jp", "maps.google.co.jp", "consent.google.com",
}

// IsMapsURL は Google マップの URL（https/http）か
func IsMapsURL(u *url.URL) bool {
	if u == nil || (u.Scheme != "https" && u.Scheme != "http") || u.User != nil {
		return false
	}
	if p := u.Port(); p != "" && p != "443" && p != "80" {
		return false
	}
	host := strings.ToLower(u.Hostname())
	for _, h := range mapsHosts {
		if host == h {
			return true
		}
	}
	return false
}

var schemePattern = regexp.MustCompile(`(?i)^https?://`)

// NormalizeMapsInput は入力に https:// がなければ付ける
func NormalizeMapsInput(raw string) string {
	if !schemePattern.MatchString(raw) {
		return "https://" + raw
	}
	return raw
}

// PlaceNameFromURL は /maps/place/<名前>/ か ?q= から場所名を取り出す
func PlaceNameFromURL(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	if i := strings.Index(u.EscapedPath(), "/place/"); i >= 0 {
		seg, _, _ := strings.Cut(u.EscapedPath()[i+len("/place/"):], "/")
		if seg != "" {
			if name, err := url.PathUnescape(strings.ReplaceAll(seg, "+", " ")); err == nil {
				return name
			}
			return seg
		}
	}
	if q := u.Query().Get("q"); q != "" {
		return strings.ReplaceAll(q, "+", " ")
	}
	return ""
}

var (
	ogTitlePattern  = regexp.MustCompile(`(?i)<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']`)
	titlePattern    = regexp.MustCompile(`(?i)<title>([^<]+)</title>`)
	mapsSuffix      = regexp.MustCompile(`(?i)\s*-\s*Google\s*(マップ|Maps)\s*$`)
	notFoundPattern = regexp.MustCompile(`(?i)dynamic\s+link\s+not\s+found`)
)

// PlaceNameFromHTML は og:title か <title> から場所名を取り出す（末尾の「 - Google マップ」は除く）
func PlaceNameFromHTML(html string) string {
	for _, re := range []*regexp.Regexp{ogTitlePattern, titlePattern} {
		if m := re.FindStringSubmatch(html); m != nil {
			if name := strings.TrimSpace(mapsSuffix.ReplaceAllString(m[1], "")); name != "" {
				return name
			}
		}
	}
	return ""
}

// ValidPlaceName は短縮リンクのエラーページの題名を場所名として扱わない
func ValidPlaceName(name string) string {
	if notFoundPattern.MatchString(name) {
		return ""
	}
	return name
}
