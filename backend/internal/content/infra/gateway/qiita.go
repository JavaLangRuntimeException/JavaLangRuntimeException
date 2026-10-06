// Package gateway は Qiita・connpass・ORCID・OGP の取得（HTML の解析を含む）。
package gateway

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"

	"github.com/javalangruntimeexception/taramanji/backend/internal/content/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/httpx"
)

const (
	qiitaUser      = "JavaLangRuntimeException"
	acceptHTML     = "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
	acceptLanguage = "ja,en-US;q=0.9,en;q=0.8"
	scrapeTimeout  = 15 * time.Second
)

type qiitaClient struct {
	client *http.Client
	token  string
}

// NewQiita は token（Qiita の個人用アクセストークン）があれば API に付ける（無ければ未認証）
func NewQiita(token string) gateway.Qiita {
	return &qiitaClient{client: httpx.New(scrapeTimeout), token: token}
}

func (q *qiitaClient) ListItems(ctx context.Context, page, perPage int, timeout time.Duration) ([]gateway.QiitaItem, error) {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	url := fmt.Sprintf("https://qiita.com/api/v2/users/%s/items?page=%d&per_page=%d", qiitaUser, page, perPage)
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if q.token != "" {
		req.Header.Set("Authorization", "Bearer "+q.token)
	}
	res, err := q.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("qiita api: HTTP %d", res.StatusCode)
	}
	var raw []struct {
		URL   string `json:"url"`
		Title string `json:"title"`
		Body  string `json:"body"`
		Tags  []struct {
			Name     string   `json:"name"`
			Versions []string `json:"versions"`
		} `json:"tags"`
	}
	if err := json.NewDecoder(res.Body).Decode(&raw); err != nil {
		return nil, err
	}
	items := make([]gateway.QiitaItem, 0, len(raw))
	for _, r := range raw {
		it := gateway.QiitaItem{URL: r.URL, Title: r.Title, Body: r.Body}
		for _, t := range r.Tags {
			it.Tags = append(it.Tags, gateway.QiitaTag{Name: t.Name, Versions: t.Versions})
		}
		items = append(items, it)
	}
	return items, nil
}

func fetchDocument(ctx context.Context, client *http.Client, url string) (*goquery.Document, error) {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	req.Header.Set("User-Agent", httpx.ChromeUA)
	req.Header.Set("Accept", acceptHTML)
	req.Header.Set("Accept-Language", acceptLanguage)
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GET %s: HTTP %d", url, res.StatusCode)
	}
	return goquery.NewDocumentFromReader(res.Body)
}

func absQiita(href string) string {
	if strings.HasPrefix(href, "http") {
		return href
	}
	return "https://qiita.com" + href
}

// stockCheckPaths はストック済みボタンのチェックマークの SVG パス（旧実装と同じ判定）
func hasStockedCheck(s *goquery.Selection) bool {
	d, _ := s.Find("svg").Find("path").First().Attr("d")
	return strings.Contains(d, "2.85 9.35") || strings.Contains(d, "2.47 2.47")
}

// isStocked は旧 isPickupArticle と同じ順で判定する
func isStocked(article *goquery.Selection) bool {
	stockButtons := article.Find(`button[aria-label*="ストック"]`)
	if stockButtons.Length() == 0 {
		stocked := false
		article.Find("button").EachWithBreak(func(_ int, btn *goquery.Selection) bool {
			if btn.Find("svg").Length() > 0 && hasStockedCheck(btn) {
				stocked = true
				return false
			}
			return true
		})
		return stocked
	}
	label, _ := stockButtons.First().Attr("aria-label")
	if strings.Contains(label, "ストックを編集する") {
		return true
	}
	return stockButtons.Find("svg").Length() > 0 && hasStockedCheck(stockButtons)
}

func (q *qiitaClient) ProfileArticles(ctx context.Context) ([]gateway.ProfileArticle, error) {
	doc, err := fetchDocument(ctx, q.client, "https://qiita.com/"+qiitaUser)
	if err != nil {
		return nil, err
	}
	var out []gateway.ProfileArticle
	seen := map[string]bool{}
	doc.Find("article").Each(func(_ int, art *goquery.Selection) {
		link := art.Find(`h2 a[href*="/items/"]`).First()
		if link.Length() == 0 {
			link = art.Find(`a[href*="/items/"]`).First()
		}
		href, ok := link.Attr("href")
		if !ok || href == "" {
			return
		}
		title := strings.TrimSpace(art.Find("h2").Text())
		if title == "" {
			title = strings.TrimSpace(link.Text())
		}
		if title == "" {
			title = strings.TrimSpace(art.Find("h3").Text())
		}
		if title == "" {
			return
		}
		u := absQiita(href)
		if seen[u] {
			return
		}
		seen[u] = true
		var tags []string
		tagSeen := map[string]bool{}
		art.Find(`a[href*="/tags/"]`).Each(func(_ int, t *goquery.Selection) {
			if name := strings.TrimSpace(t.Text()); name != "" && !tagSeen[name] {
				tagSeen[name] = true
				tags = append(tags, name)
			}
		})
		out = append(out, gateway.ProfileArticle{URL: u, Title: title, Tags: tags, Stocked: isStocked(art)})
	})
	return out, nil
}

func isHeading(s *goquery.Selection, levels ...string) bool {
	name := strings.ToUpper(goquery.NodeName(s))
	for _, l := range levels {
		if name == l {
			return true
		}
	}
	return false
}

// CheatSheetLinks は旧 qiita-scrape-article と同じ手順で「チートシート」見出しの後のリンクを集める
func (q *qiitaClient) CheatSheetLinks(ctx context.Context, articleURL string) ([]gateway.ArticleLink, error) {
	doc, err := fetchDocument(ctx, q.client, articleURL)
	if err != nil {
		return nil, err
	}
	var links []gateway.ArticleLink
	seen := map[string]bool{}
	collect := func(s *goquery.Selection) {
		s.Find(`a[href*="/items/"]`).Each(func(_ int, a *goquery.Selection) {
			href, _ := a.Attr("href")
			text := strings.TrimSpace(a.Text())
			if href == "" || text == "" {
				return
			}
			u := absQiita(href)
			if !seen[u] {
				seen[u] = true
				links = append(links, gateway.ArticleLink{URL: u, Title: text})
			}
		})
	}
	doc.Find("h2, h3, h4").Each(func(_ int, h *goquery.Selection) {
		if !strings.Contains(strings.TrimSpace(h.Text()), "チートシート") {
			return
		}
		cur := h.Next()
		for depth := 0; cur.Length() > 0 && depth < 1000; depth++ {
			if isHeading(cur, "H1", "H2", "H3", "H4") {
				t := strings.TrimSpace(cur.Text())
				if strings.Contains(t, "シリーズ記事") || (t != "" && !strings.Contains(t, "チートシート")) {
					break
				}
			}
			collect(cur)
			cur = cur.Next()
		}
	})
	if len(links) > 0 {
		return links, nil
	}
	doc.Find("article, .it-article_body").Each(func(_ int, art *goquery.Selection) {
		art.Find("h2, h3, h4, p").Each(func(_ int, el *goquery.Selection) {
			if !strings.Contains(strings.TrimSpace(el.Text()), "他のチートシート") {
				return
			}
			cur := el.Next()
			for depth := 0; cur.Length() > 0 && depth < 500; depth++ {
				collect(cur)
				if isHeading(cur, "H1", "H2", "H3") && strings.Contains(strings.TrimSpace(cur.Text()), "シリーズ記事") {
					break
				}
				cur = cur.Next()
			}
		})
	})
	return links, nil
}
