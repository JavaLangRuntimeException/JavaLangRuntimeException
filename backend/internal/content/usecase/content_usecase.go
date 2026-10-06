package usecase

import (
	"context"
	"errors"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/content/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/content/domain/service"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/errs"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/observability"
)

// ContentUsecaseImpl は外部の公開情報を返す。旧 API と同じく、取得できないときは空の結果を返す。
type ContentUsecaseImpl struct {
	service *service.ContentService
	metrics observability.Metrics
}

var _ ContentUsecase = (*ContentUsecaseImpl)(nil)

func NewContentUsecase(s *service.ContentService, m observability.Metrics) *ContentUsecaseImpl {
	return &ContentUsecaseImpl{service: s, metrics: m}
}

// track は外部 API ごとの成否と所要時間（Datadog: content.external.*）
func (u *ContentUsecaseImpl) track(source string, start time.Time, err error) {
	status := "ok"
	if err != nil {
		status = "error"
	}
	u.metrics.Timing("content.external.duration", time.Since(start), "source:"+source, "status:"+status)
	u.metrics.Count("content.external.requests", 1, "source:"+source, "status:"+status)
}

func (u *ContentUsecaseImpl) ListQiitaItems(ctx context.Context, in ListQiitaItemsInput) (*ListQiitaItemsOutput, error) {
	start := time.Now()
	items := u.service.QiitaItems(ctx, int(in.Page), in.Initial, int(in.PerPage))
	var err error
	if items == nil {
		err = errors.New("empty")
	}
	u.track("qiita_api", start, err)
	out := &ListQiitaItemsOutput{Urls: []string{}, Items: []*QiitaItem{}}
	for _, it := range items {
		if !in.IncludeTags {
			out.Urls = append(out.Urls, it.URL)
			continue
		}
		qi := &QiitaItem{URL: it.URL, Title: it.Title, Body: it.Body, Tags: []*QiitaTag{}}
		for _, t := range it.Tags {
			qi.Tags = append(qi.Tags, &QiitaTag{Name: t.Name, Versions: t.Versions})
		}
		out.Items = append(out.Items, qi)
	}
	return out, nil
}

func toScraped(as []gateway.ProfileArticle) []*ScrapedArticle {
	out := make([]*ScrapedArticle, 0, len(as))
	for _, a := range as {
		tags := a.Tags
		if tags == nil {
			tags = []string{}
		}
		out = append(out, &ScrapedArticle{URL: a.URL, Title: a.Title, Tags: tags})
	}
	return out
}

func (u *ContentUsecaseImpl) ScrapeQiitaProfile(ctx context.Context, _ ScrapeQiitaProfileInput) (*ScrapeQiitaProfileOutput, error) {
	start := time.Now()
	pickup, latest, err := u.service.ProfileArticles(ctx)
	u.track("qiita_profile", start, err)
	return &ScrapeQiitaProfileOutput{PickupArticles: toScraped(pickup), LatestArticles: toScraped(latest)}, nil
}

func (u *ContentUsecaseImpl) ScrapeQiitaArticleLinks(ctx context.Context, in ScrapeQiitaArticleLinksInput) (*ScrapeQiitaArticleLinksOutput, error) {
	if in.URL == "" {
		return nil, errs.NewValidationError("url", "url is required").WithCode("missing_url")
	}
	start := time.Now()
	links, err := u.service.CheatSheetLinks(ctx, in.URL)
	if errors.Is(err, service.ErrNotQiita) {
		return nil, errs.NewValidationError("url", err.Error()).WithCode("url_not_allowed")
	}
	u.track("qiita_article", start, err)
	out := &ScrapeQiitaArticleLinksOutput{Links: []*ArticleLink{}}
	for _, l := range links {
		out.Links = append(out.Links, &ArticleLink{URL: l.URL, Title: l.Title})
	}
	return out, nil
}

func (u *ContentUsecaseImpl) ListConnpassEvents(ctx context.Context, in ListConnpassEventsInput) (*ListConnpassEventsOutput, error) {
	start := time.Now()
	events, err := u.service.UpcomingOwnedEvents(ctx, in.Nickname)
	u.track("connpass", start, err)
	out := &ListConnpassEventsOutput{Events: []*ConnpassEvent{}}
	for _, e := range events {
		started := e.StartedAt.Format("2006-01-02T15:04:05-07:00")
		out.Events = append(out.Events, &ConnpassEvent{EventID: e.EventID, Title: e.Title, EventURL: e.EventURL,
			StartedAt: started, EndedAt: started, Limit: e.Limit, Accepted: e.Accepted, Place: e.Place, ImageURL: e.ImageURL})
	}
	out.ResultsReturned = int32(len(out.Events))
	out.ResultsAvailable = int32(len(out.Events))
	return out, nil
}

func (u *ContentUsecaseImpl) ListOrcidWorks(ctx context.Context, _ ListOrcidWorksInput) (*ListOrcidWorksOutput, error) {
	start := time.Now()
	works, err := u.service.OrcidWorks(ctx)
	u.track("orcid", start, err)
	out := &ListOrcidWorksOutput{OrcidID: service.OrcidID, Works: []*OrcidWork{}}
	for _, w := range works {
		authors := w.Authors
		if authors == nil {
			authors = []string{}
		}
		out.Works = append(out.Works, &OrcidWork{PutCode: w.PutCode, Title: w.Title, Type: w.Type, Venue: w.Venue,
			Date: w.Date, Doi: w.DOI, URL: w.URL, Authors: authors})
	}
	return out, nil
}

func (u *ContentUsecaseImpl) GetOgp(ctx context.Context, in GetOgpInput) (*GetOgpOutput, error) {
	start := time.Now()
	data := u.service.Ogp(ctx, in.Urls, in.NoCache)
	u.track("ogp", start, nil)
	out := &GetOgpOutput{Data: make([]*Ogp, 0, len(data))}
	for _, o := range data {
		out.Data = append(out.Data, &Ogp{URL: o.URL, Title: o.Title, Description: o.Description, Images: o.Images,
			SiteName: o.SiteName, MediaType: o.MediaType, ContentType: o.ContentType, Favicons: o.Favicons})
	}
	return out, nil
}
