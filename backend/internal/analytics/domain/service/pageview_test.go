package service

import "testing"

func TestPageOf(t *testing.T) {
	for in, want := range map[string]string{"/": "/", "": "/", "/blogs?q=go": "/blogs", "/blogs/123": "/blogs", "/reserve": "/reserve",
		"/unknown/x": "other", "/admin": "other", "/calendar-sync": "/calendar-sync"} {
		if got := PageOf(in); got != want {
			t.Errorf("PageOf(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestCounted(t *testing.T) {
	if Counted("Mozilla/5.0 (compatible; Googlebot/2.1)", "/") || Counted("curl/8", "/") || Counted("Mozilla/5.0", "/admin/x") {
		t.Fatal("should not count")
	}
	if !Counted("Mozilla/5.0 (Macintosh)", "/blogs") {
		t.Fatal("should count")
	}
	if SiteOf("www.taramanji.com") != "taramanji.com" || SiteOf("next.taramanji.com") != "other" || SiteOf("taramanji.com:443") != "taramanji.com" {
		t.Fatal("site")
	}
}
