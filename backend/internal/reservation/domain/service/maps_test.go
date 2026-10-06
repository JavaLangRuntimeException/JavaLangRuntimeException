package service

import (
	"net/url"
	"testing"
)

func TestIsMapsURL(t *testing.T) {
	for raw, want := range map[string]bool{
		"https://maps.app.goo.gl/abc":                 true,
		"https://www.google.com/maps/place/Kyoto":     true,
		"http://maps.google.co.jp/?q=x":               true,
		"https://evil.example.com/maps":               false,
		"https://maps.app.goo.gl.evil.com/":           false,
		"https://user@maps.app.goo.gl/":               false,
		"https://maps.app.goo.gl:8443/":               false,
		"file:///etc/passwd":                          false,
		"http://169.254.169.254/latest/meta-data":     false,
		"https://kubernetes.default.svc/api":          false,
		"https://redis.data.svc.cluster.local:6379/x": false,
	} {
		u, _ := url.Parse(raw)
		if got := IsMapsURL(u); got != want {
			t.Errorf("IsMapsURL(%q) = %v, want %v", raw, got, want)
		}
	}
}

func TestPlaceName(t *testing.T) {
	if got := PlaceNameFromURL("https://www.google.com/maps/place/%E4%BA%AC%E9%83%BD%E9%A7%85+%E3%83%93%E3%83%AB/@35,135"); got != "京都駅 ビル" {
		t.Errorf("place = %q", got)
	}
	if got := PlaceNameFromURL("https://maps.google.com/?q=Kyoto+Tower"); got != "Kyoto Tower" {
		t.Errorf("q = %q", got)
	}
	if got := PlaceNameFromHTML(`<meta property="og:title" content="京都タワー - Google マップ">`); got != "京都タワー" {
		t.Errorf("og = %q", got)
	}
	if got := PlaceNameFromHTML(`<title>Kyoto Tower - Google Maps</title>`); got != "Kyoto Tower" {
		t.Errorf("title = %q", got)
	}
	if got := ValidPlaceName("Dynamic Link Not Found"); got != "" {
		t.Errorf("not found = %q", got)
	}
	if got := NormalizeMapsInput("maps.app.goo.gl/x"); got != "https://maps.app.goo.gl/x" {
		t.Errorf("normalize = %q", got)
	}
}
