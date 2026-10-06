package gateway

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"

	"github.com/javalangruntimeexception/taramanji/backend/internal/content/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/httpx"
)

// ogpFetcher は旧実装（link-preview-js）と同じ項目を返す
type ogpFetcher struct{ client *http.Client }

func NewOgpFetcher() gateway.OgpFetcher { return &ogpFetcher{client: httpx.New(5 * time.Second)} }

func meta(doc *goquery.Document, selectors ...string) string {
	for _, sel := range selectors {
		if v, ok := doc.Find(sel).First().Attr("content"); ok && strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

func resolve(base *url.URL, ref string) string {
	u, err := base.Parse(strings.TrimSpace(ref))
	if err != nil {
		return ref
	}
	return u.String()
}

func (f *ogpFetcher) Fetch(ctx context.Context, raw string) (*gateway.Ogp, error) {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, raw, nil)
	req.Header.Set("Accept-Language", "ja")
	req.Header.Set("User-Agent", httpx.ChromeUA)
	res, err := f.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	doc, err := goquery.NewDocumentFromReader(res.Body)
	if err != nil {
		return nil, err
	}
	final := res.Request.URL
	o := &gateway.Ogp{
		URL:         final.String(),
		Title:       meta(doc, `meta[property="og:title"]`, `meta[name="twitter:title"]`),
		Description: meta(doc, `meta[property="og:description"]`, `meta[name="description"]`, `meta[name="twitter:description"]`),
		SiteName:    meta(doc, `meta[property="og:site_name"]`),
		MediaType:   meta(doc, `meta[property="og:type"]`),
		ContentType: strings.ToLower(strings.TrimSpace(strings.Split(res.Header.Get("Content-Type"), ";")[0])),
		Images:      []string{},
		Favicons:    []string{},
	}
	if o.Title == "" {
		o.Title = strings.TrimSpace(doc.Find("title").First().Text())
	}
	if o.MediaType == "" {
		o.MediaType = "website"
	}
	doc.Find(`meta[property="og:image"], meta[property="og:image:url"]`).Each(func(_ int, s *goquery.Selection) {
		if v, ok := s.Attr("content"); ok && v != "" {
			o.Images = append(o.Images, resolve(final, v))
		}
	})
	if len(o.Images) == 0 {
		if v := meta(doc, `meta[name="twitter:image"]`); v != "" {
			o.Images = append(o.Images, resolve(final, v))
		} else if v, ok := doc.Find(`link[rel="image_src"]`).First().Attr("href"); ok {
			o.Images = append(o.Images, resolve(final, v))
		}
	}
	doc.Find(`link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]`).Each(func(_ int, s *goquery.Selection) {
		if v, ok := s.Attr("href"); ok && v != "" {
			o.Favicons = append(o.Favicons, resolve(final, v))
		}
	})
	if len(o.Favicons) == 0 {
		o.Favicons = append(o.Favicons, resolve(final, "/favicon.ico"))
	}
	return o, nil
}
