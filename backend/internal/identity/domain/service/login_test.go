package service

import "testing"

func TestSafeCallback(t *testing.T) {
	for in, want := range map[string]string{
		"":                               "/admin",
		"/admin":                         "/admin",
		"/admin?x=1":                     "/admin?x=1",
		"https://taramanji.com/admin":    "/admin",
		"https://evil.example.com/admin": "/admin",
		"//evil.example.com":             "/admin",
		"/\\evil.example.com":            "/admin",
		"javascript:alert(1)":            "/admin",
		"admin":                          "/admin",
	} {
		if got := SafeCallback(in, "/admin"); got != want {
			t.Errorf("SafeCallback(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestRedirectURI(t *testing.T) {
	h := ParseHosts(" taramanji.com, GWS.taramanji.com ")
	if got := h.RedirectURI("gws.taramanji.com", true); got != "https://gws.taramanji.com/api/auth/callback/google" {
		t.Fatal(got)
	}
	if got := h.RedirectURI("evil.example.com", true); got != "" {
		t.Fatal(got)
	}
}
