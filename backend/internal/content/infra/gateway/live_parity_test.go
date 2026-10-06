//go:build live

package gateway

// 本番の旧 API（https://taramanji.com/api/...）と同じ結果になるかを、本物のサイトに対して確かめる。
// 実行: go test -tags live ./internal/content/infra/gateway/ -run Live -v

import (
	"context"
	"encoding/json"
	"net/http"
	"reflect"
	"testing"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/content/domain/service"
)

func legacy(t *testing.T, path string, v any) {
	t.Helper()
	res, err := http.Get("https://taramanji.com" + path)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if err := json.NewDecoder(res.Body).Decode(v); err != nil {
		t.Fatal(err)
	}
}

type art struct {
	URL   string   `json:"url"`
	Title string   `json:"title"`
	Tags  []string `json:"tags"`
}

func TestLiveQiitaProfileParity(t *testing.T) {
	var want struct {
		Pickup []art `json:"pickupArticles"`
		Latest []art `json:"latestArticles"`
	}
	legacy(t, "/api/qiita-scrape", &want)
	all, err := NewQiita("").ProfileArticles(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	pickup, latest := service.SplitProfileArticles(all)
	// nil と空の配列は同じ扱い（JSON ではどちらも []）
	conv := func(in []art) []art {
		if in == nil {
			return []art{}
		}
		return in
	}
	gotP, gotL := []art{}, []art{}
	for _, a := range pickup {
		gotP = append(gotP, art{a.URL, a.Title, a.Tags})
	}
	for _, a := range latest {
		gotL = append(gotL, art{a.URL, a.Title, a.Tags})
	}
	if !reflect.DeepEqual(gotP, conv(want.Pickup)) || !reflect.DeepEqual(gotL, conv(want.Latest)) {
		t.Fatalf("differs\n go pickup=%v\nold pickup=%v\n go latest=%v\nold latest=%v", gotP, want.Pickup, gotL, want.Latest)
	}
	t.Logf("pickup=%d latest=%d 一致", len(gotP), len(gotL))
}

func TestLiveCheatSheetParity(t *testing.T) {
	const u = "https://qiita.com/JavaLangRuntimeException/items/6b46551f56e0def76eba"
	var want struct {
		Links []struct{ URL, Title string } `json:"links"`
	}
	legacy(t, "/api/qiita-scrape-article?url="+u, &want)
	links, err := NewQiita("").CheatSheetLinks(context.Background(), u)
	if err != nil {
		t.Fatal(err)
	}
	if len(links) != len(want.Links) {
		t.Fatalf("count: go=%d old=%d", len(links), len(want.Links))
	}
	for i := range links {
		if links[i].URL != want.Links[i].URL || links[i].Title != want.Links[i].Title {
			t.Fatalf("link %d differs: %+v vs %+v", i, links[i], want.Links[i])
		}
	}
	t.Logf("links=%d 一致", len(links))
}

func TestLiveConnpassParity(t *testing.T) {
	var want struct {
		Events []struct {
			EventID  int64  `json:"event_id"`
			Title    string `json:"title"`
			URL      string `json:"event_url"`
			Started  string `json:"started_at"`
			Limit    int32  `json:"limit"`
			Accepted int32  `json:"accepted"`
			Place    string `json:"place"`
			Image    string `json:"image_url"`
		} `json:"events"`
	}
	legacy(t, "/api/connpass", &want)
	svc := service.NewContentService(nil, NewConnpass(), nil, nil, nil, time.Now)
	got, err := svc.UpcomingOwnedEvents(context.Background(), "")
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != len(want.Events) {
		t.Fatalf("count: go=%d old=%d", len(got), len(want.Events))
	}
	for i, e := range got {
		w := want.Events[i]
		if e.EventID != w.EventID || e.Title != w.Title || e.EventURL != w.URL || e.StartedAt.Format("2006-01-02T15:04:05-07:00") != w.Started ||
			e.Limit != w.Limit || e.Accepted != w.Accepted || e.Place != w.Place || e.ImageURL != w.Image {
			t.Fatalf("event %d differs:\n go %+v\nold %+v", i, e, w)
		}
	}
	t.Logf("events=%d 一致", len(got))
}

func TestLiveOrcidParity(t *testing.T) {
	var want struct {
		Works []struct {
			PutCode int64    `json:"putCode"`
			Title   string   `json:"title"`
			Type    string   `json:"type"`
			Venue   string   `json:"venue"`
			Date    string   `json:"date"`
			DOI     *string  `json:"doi"`
			URL     *string  `json:"url"`
			Authors []string `json:"authors"`
		} `json:"works"`
	}
	legacy(t, "/api/orcid", &want)
	got, err := NewOrcid().Works(context.Background(), service.OrcidID)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != len(want.Works) {
		t.Fatalf("count: go=%d old=%d", len(got), len(want.Works))
	}
	deref := func(p *string) string {
		if p == nil {
			return ""
		}
		return *p
	}
	for i, g := range got {
		w := want.Works[i]
		if g.PutCode != w.PutCode || g.Title != w.Title || g.Type != w.Type || g.Venue != w.Venue || g.Date != w.Date ||
			g.DOI != deref(w.DOI) || g.URL != deref(w.URL) || !reflect.DeepEqual(g.Authors, w.Authors) {
			t.Fatalf("work %d differs:\n go %+v\nold %+v", i, g, w)
		}
	}
	t.Logf("works=%d 一致", len(got))
}

func TestLiveQiitaAPIParity(t *testing.T) {
	var want struct {
		Items []struct {
			URL   string `json:"url"`
			Title string `json:"title"`
		} `json:"items"`
	}
	legacy(t, "/api/qiita?page=1&includeTags=1&perPage=10", &want)
	got, err := NewQiita("").ListItems(context.Background(), 1, 10, 8*time.Second)
	if err != nil {
		t.Skipf("Qiita API（未認証）に制限された可能性: %v", err)
	}
	for i := range got {
		if got[i].URL != want.Items[i].URL || got[i].Title != want.Items[i].Title {
			t.Fatalf("item %d differs", i)
		}
	}
	t.Logf("items=%d 一致", len(got))
}
