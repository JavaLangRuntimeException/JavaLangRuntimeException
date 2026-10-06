// Package gateway は外部の公開情報（Qiita・connpass・ORCID・OGP）の取得口。実装は infra/gateway。
package gateway

import (
	"context"
	"time"
)

type QiitaTag struct {
	Name     string
	Versions []string
}

type QiitaItem struct {
	URL   string
	Title string
	Body  string
	Tags  []QiitaTag
}

// ProfileArticle は Qiita のプロフィールに並ぶ記事（出現順）。Stocked はストック済み = ピックアップ
type ProfileArticle struct {
	URL     string
	Title   string
	Tags    []string
	Stocked bool
}

type ArticleLink struct {
	URL   string
	Title string
}

type ConnpassEvent struct {
	EventID   int64
	Title     string
	EventURL  string
	StartedAt time.Time
	Limit     int32
	Accepted  int32
	Place     string
	ImageURL  string
}

type OrcidWork struct {
	PutCode int64
	Title   string
	Type    string
	Venue   string
	Date    string
	DOI     string
	URL     string
	Authors []string
}

type Ogp struct {
	URL         string   `json:"url"`
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Images      []string `json:"images"`
	SiteName    string   `json:"siteName"`
	MediaType   string   `json:"mediaType"`
	ContentType string   `json:"contentType"`
	Favicons    []string `json:"favicons"`
}

type Qiita interface {
	ListItems(ctx context.Context, page, perPage int, timeout time.Duration) ([]QiitaItem, error)
	ProfileArticles(ctx context.Context) ([]ProfileArticle, error)
	CheatSheetLinks(ctx context.Context, articleURL string) ([]ArticleLink, error)
}

type Connpass interface {
	OwnedEvents(ctx context.Context, nickname string) ([]ConnpassEvent, error)
}

type Orcid interface {
	Works(ctx context.Context, orcidID string) ([]OrcidWork, error)
}

type OgpFetcher interface {
	Fetch(ctx context.Context, url string) (*Ogp, error)
}

// Cache は期限付きのキャッシュ（Redis）
type Cache interface {
	Get(ctx context.Context, key string, v any) (bool, error)
	Set(ctx context.Context, key string, v any, ttl time.Duration) error
}
