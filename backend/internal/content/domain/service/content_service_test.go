package service

import (
	"testing"

	"github.com/javalangruntimeexception/taramanji/backend/internal/content/domain/gateway"
)

func urls(as []gateway.ProfileArticle) string {
	s := ""
	for _, a := range as {
		s += a.URL
	}
	return s
}

func TestSplitProfileArticles(t *testing.T) {
	a := func(u string, stocked bool) gateway.ProfileArticle {
		return gateway.ProfileArticle{URL: u, Stocked: stocked}
	}
	pickup, latest := SplitProfileArticles([]gateway.ProfileArticle{a("1", true), a("2", false), a("1", true), a("3", true), a("4", false)})
	if urls(pickup) != "13" || urls(latest) != "24" {
		t.Fatalf("pickup=%s latest=%s", urls(pickup), urls(latest))
	}
	// 最新が足りず、ピックアップ候補が 4 件以上ある → 4 件目以降で補う（旧実装と同じ）
	pickup, latest = SplitProfileArticles([]gateway.ProfileArticle{a("1", true), a("2", true), a("3", true), a("4", true), a("5", true), a("6", false)})
	if urls(pickup) != "123" || urls(latest) != "645" {
		t.Fatalf("pickup=%s latest=%s", urls(pickup), urls(latest))
	}
}

func TestIsQiitaURL(t *testing.T) {
	for u, want := range map[string]bool{
		"https://qiita.com/u/items/x":      true,
		"https://foo.qiita.com/a":          true,
		"http://qiita.com/u":               false,
		"https://qiita.com.evil.example/x": false,
		"https://evilqiita.com/x":          false,
		"https://169.254.169.254/latest":   false,
	} {
		if IsQiitaURL(u) != want {
			t.Errorf("%s: want %v", u, want)
		}
	}
}
