package service

import (
	"context"
	"fmt"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/content/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/jst"
)

const (
	OrcidID          = "0009-0005-4751-648X"
	DefaultConnpass  = "tarakokko3233"
	maxOwnedEvents   = 10
	articlesPerGroup = 3
	ogpTTL           = 365 * 24 * time.Hour // 旧実装と同じ 1 年
	orcidTTL         = time.Hour            // 旧実装の revalidate: 3600
	ogpConcurrency   = 8
)

type ContentService struct {
	qiita    gateway.Qiita
	connpass gateway.Connpass
	orcid    gateway.Orcid
	ogp      gateway.OgpFetcher
	cache    gateway.Cache
	clock    func() time.Time
}

func NewContentService(q gateway.Qiita, c gateway.Connpass, o gateway.Orcid, og gateway.OgpFetcher, cache gateway.Cache, clock func() time.Time) *ContentService {
	if clock == nil {
		clock = time.Now
	}
	return &ContentService{qiita: q, connpass: c, orcid: o, ogp: og, cache: cache, clock: clock}
}

// QiitaItems は旧 API と同じ件数規則（指定がなければ初回 15 件・以降 20 件、初回は 5 秒・以降 8 秒で打ち切る）
func (s *ContentService) QiitaItems(ctx context.Context, page int, initial bool, perPage int) []gateway.QiitaItem {
	if page < 1 {
		page = 1
	}
	if perPage <= 0 {
		perPage = 20
		if initial {
			perPage = 15
		}
	}
	timeout := 8 * time.Second
	if initial {
		timeout = 5 * time.Second
	}
	items, err := s.qiita.ListItems(ctx, page, perPage, timeout)
	if err != nil {
		return nil // 旧 API と同じく失敗は空で返す
	}
	return items
}

// SplitProfileArticles はピックアップ（ストック済み）3 件と最新 3 件に分ける。
// 最新が 3 件に満たず、ピックアップ候補が 4 件以上あれば、4 件目以降を最新として補う（旧実装と同じ）。
func SplitProfileArticles(all []gateway.ProfileArticle) (pickup, latest []gateway.ProfileArticle) {
	var pickupCandidates, latestCandidates []gateway.ProfileArticle
	seen := map[string]bool{}
	for _, a := range all {
		if seen[a.URL] {
			continue
		}
		seen[a.URL] = true
		if a.Stocked {
			pickupCandidates = append(pickupCandidates, a)
		} else {
			latestCandidates = append(latestCandidates, a)
		}
	}
	pickup = pickupCandidates[:min(articlesPerGroup, len(pickupCandidates))]
	latest = latestCandidates
	if len(latest) < articlesPerGroup && len(pickupCandidates) > articlesPerGroup {
		latest = append(latest, pickupCandidates[articlesPerGroup:]...)
	}
	latest = latest[:min(articlesPerGroup, len(latest))]
	return pickup, latest
}

func (s *ContentService) ProfileArticles(ctx context.Context) (pickup, latest []gateway.ProfileArticle, err error) {
	all, err := s.qiita.ProfileArticles(ctx)
	if err != nil {
		return nil, nil, err
	}
	pickup, latest = SplitProfileArticles(all)
	return pickup, latest, nil
}

// ErrNotQiita は qiita.com 以外の URL（任意の URL を取得させない）
var ErrNotQiita = fmt.Errorf("only https://qiita.com URLs are allowed")

func IsQiitaURL(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" {
		return false
	}
	h := strings.ToLower(u.Hostname())
	return h == "qiita.com" || strings.HasSuffix(h, ".qiita.com")
}

func (s *ContentService) CheatSheetLinks(ctx context.Context, articleURL string) ([]gateway.ArticleLink, error) {
	if !IsQiitaURL(articleURL) {
		return nil, ErrNotQiita
	}
	return s.qiita.CheatSheetLinks(ctx, articleURL)
}

// UpcomingOwnedEvents は今日（JST）以降の主催イベントを最大 10 件、開始が近い順に返す。
func (s *ContentService) UpcomingOwnedEvents(ctx context.Context, nickname string) ([]gateway.ConnpassEvent, error) {
	if nickname == "" {
		nickname = DefaultConnpass
	}
	events, err := s.connpass.OwnedEvents(ctx, nickname)
	if err != nil {
		return nil, err
	}
	today := s.clock().In(jst.Location)
	today = time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, jst.Location)
	var out []gateway.ConnpassEvent
	for _, e := range events {
		if len(out) >= maxOwnedEvents {
			break
		}
		if e.StartedAt.IsZero() || e.StartedAt.Before(today) || e.Title == "" || e.EventURL == "" {
			continue
		}
		out = append(out, e)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].StartedAt.Before(out[j].StartedAt) })
	return out, nil
}

// OrcidWorks は 1 時間キャッシュする（レプリカ間で共有）。
func (s *ContentService) OrcidWorks(ctx context.Context) ([]gateway.OrcidWork, error) {
	key := "content:orcid:" + OrcidID
	var cached []gateway.OrcidWork
	if ok, _ := s.cache.Get(ctx, key, &cached); ok {
		return cached, nil
	}
	works, err := s.orcid.Works(ctx, OrcidID)
	if err != nil {
		return nil, err
	}
	_ = s.cache.Set(ctx, key, works, orcidTTL)
	return works, nil
}

// Ogp は入力と同じ順番で返す。qiita.com 以外と取得失敗は空。未取得分は並行して取りに行く（旧実装の Promise.all と同じ）。
// noCache なら取得し直し、キャッシュも更新しない（旧実装と同じ）。
func (s *ContentService) Ogp(ctx context.Context, urls []string, noCache bool) []gateway.Ogp {
	out := make([]gateway.Ogp, len(urls))
	var wg sync.WaitGroup
	sem := make(chan struct{}, ogpConcurrency)
	for i, u := range urls {
		if !IsQiitaURL(u) {
			continue
		}
		key := "content:ogp:" + u
		if !noCache {
			var cached gateway.Ogp
			if ok, _ := s.cache.Get(ctx, key, &cached); ok {
				out[i] = cached
				continue
			}
		}
		wg.Add(1)
		go func(i int, u, key string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			o, err := s.ogp.Fetch(ctx, u)
			if err != nil || o == nil {
				return
			}
			out[i] = *o
			if !noCache {
				_ = s.cache.Set(ctx, key, o, ogpTTL)
			}
		}(i, u, key)
	}
	wg.Wait()
	return out
}
