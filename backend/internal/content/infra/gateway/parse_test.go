package gateway

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/PuerkitoBio/goquery"

	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/jst"
)

func serve(t *testing.T, html string) *httptest.Server {
	t.Helper()
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, html)
	}))
	t.Cleanup(s.Close)
	return s
}

func TestCheatSheetLinks_StopsAtNextSection(t *testing.T) {
	s := serve(t, `<html><body>
<h2>はじめに</h2><p><a href="/x/items/ignored">対象外</a></p>
<h2>他のチートシート</h2>
<ul><li><a href="/u/items/aaa">Git チートシート</a></li><li><a href="https://qiita.com/u/items/bbb">Docker チートシート</a></li></ul>
<h3>チートシート(続き)</h3><p><a href="/u/items/aaa">重複</a> <a href="/u/items/ccc">Linux チートシート</a></p>
<h2>他のシリーズ記事</h2><p><a href="/u/items/zzz">シリーズ</a></p>
</body></html>`)
	links, err := (&qiitaClient{client: s.Client()}).CheatSheetLinks(context.Background(), s.URL)
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	for _, l := range links {
		got = append(got, l.Title+"="+l.URL)
	}
	want := "Git チートシート=https://qiita.com/u/items/aaa,Docker チートシート=https://qiita.com/u/items/bbb,Linux チートシート=https://qiita.com/u/items/ccc"
	if strings.Join(got, ",") != want {
		t.Fatalf("got %v", got)
	}
}

func TestCheatSheetLinks_FallbackParagraph(t *testing.T) {
	s := serve(t, `<html><body><div class="it-article_body">
<p>他のチートシートはこちら</p><ul><li><a href="/u/items/aaa">A</a></li></ul>
<h3>他のシリーズ記事</h3><ul><li><a href="/u/items/zzz">Z</a></li></ul>
</div></body></html>`)
	links, _ := (&qiitaClient{client: s.Client()}).CheatSheetLinks(context.Background(), s.URL)
	if len(links) != 1 || links[0].Title != "A" {
		t.Fatalf("got %+v", links)
	}
}

func TestIsStocked(t *testing.T) {
	cases := map[string]bool{
		`<article><button aria-label="ストックを編集する"></button></article>`:                                    true,
		`<article><button aria-label="ストックする"></button></article>`:                                       false,
		`<article><button aria-label="ストックする"><svg><path d="M2.85 9.35 L5 5"/></svg></button></article>`: true,
		`<article><button><svg><path d="M1 2.47 2.47 3"/></svg></button></article>`:                      true,
		`<article><button><svg><path d="M0 0"/></svg></button></article>`:                                false,
	}
	for html, want := range cases {
		doc, _ := goquery.NewDocumentFromReader(strings.NewReader(html))
		if got := isStocked(doc.Find("article")); got != want {
			t.Errorf("%s: got %v want %v", html, got, want)
		}
	}
}

func TestConnpassOwnedEvents(t *testing.T) {
	s := serve(t, `<html><body>
<div class="event_list"><span class="label_status_tag owner">主催</span>
  <div class="event_thumbnail"><img class="photo" src="https://img/1.png"></div>
  <p class="event_title"><a class="url summary" href="https://kyotogo.connpass.com/event/123456/">kyoto.go #70</a></p>
  <p class="year">2026</p><p class="date">11/3</p><p class="time">（火）19:00〜</p>
  <p class="event_place"><span class="icon_place">京都市</span></p>
  <p class="event_participants"><span class="amount"><span>12</span>/30</span></p>
</div>
<div class="event_list"><p class="event_title"><a class="url summary" href="https://x.connpass.com/event/9/">参加のみ</a></p></div>
</body></html>`)
	c := &connpassClient{client: s.Client()}
	events, err := c.parse(context.Background(), s.URL)
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 1 {
		t.Fatalf("want owner event only, got %d", len(events))
	}
	e := events[0]
	want := time.Date(2026, 11, 3, 19, 0, 0, 0, jst.Location)
	if e.EventID != 123456 || e.Title != "kyoto.go #70" || !e.StartedAt.Equal(want) || e.Accepted != 12 || e.Limit != 30 || e.Place != "京都市" || e.ImageURL != "https://img/1.png" {
		t.Fatalf("got %+v", e)
	}
}
