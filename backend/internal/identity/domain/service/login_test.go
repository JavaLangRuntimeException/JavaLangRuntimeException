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
