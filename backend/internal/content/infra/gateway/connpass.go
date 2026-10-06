package gateway

import (
	"context"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"

	"github.com/javalangruntimeexception/taramanji/backend/internal/content/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/httpx"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/jst"
)

var (
	connpassEventID = regexp.MustCompile(`/event/(\d+)/`)
	connpassTime    = regexp.MustCompile(`（.）(\d{1,2}):(\d{2})`)
	connpassLimit   = regexp.MustCompile(`/\s*(\d+)`)
	leadingDigits   = regexp.MustCompile(`^\s*(\d+)`)
)

type connpassClient struct{ client *http.Client }

func NewConnpass() gateway.Connpass { return &connpassClient{client: httpx.New(scrapeTimeout)} }

// parseIntPrefix は JS の parseInt と同じく先頭の数字だけを読む（読めなければ 0）
func parseIntPrefix(s string) int64 {
	m := leadingDigits.FindStringSubmatch(s)
	if m == nil {
		return 0
	}
	n, _ := strconv.ParseInt(m[1], 10, 64)
	return n
}

func (c *connpassClient) OwnedEvents(ctx context.Context, nickname string) ([]gateway.ConnpassEvent, error) {
	return c.parse(ctx, fmt.Sprintf("https://connpass.com/user/%s/", nickname))
}

// parse はプロフィールページから主催イベントを読む
func (c *connpassClient) parse(ctx context.Context, pageURL string) ([]gateway.ConnpassEvent, error) {
	doc, err := fetchDocument(ctx, c.client, pageURL)
	if err != nil {
		return nil, err
	}
	var out []gateway.ConnpassEvent
	doc.Find(".event_list").Each(func(_ int, ev *goquery.Selection) {
		if ev.Find(".label_status_tag.owner").Length() == 0 {
			return
		}
		link := ev.Find(".event_title a.url.summary")
		href, _ := link.Attr("href")
		img, _ := ev.Find(".event_thumbnail img.photo").Attr("src")
		year := strings.TrimSpace(ev.Find(".year").Text())
		date := strings.TrimSpace(ev.Find(".date").Text())
		tm := strings.TrimSpace(ev.Find(".time").Text())
		place := strings.TrimSpace(ev.Find(".event_place .icon_place").Text())
		if place == "" {
			place = "オンライン"
		}
		e := gateway.ConnpassEvent{
			Title:    strings.TrimSpace(link.Text()),
			EventURL: href,
			Place:    place,
			ImageURL: img,
			Accepted: int32(parseIntPrefix(ev.Find(".event_participants .amount span").First().Text())),
		}
		if m := connpassEventID.FindStringSubmatch(href); m != nil {
			e.EventID, _ = strconv.ParseInt(m[1], 10, 64)
		}
		if m := connpassLimit.FindStringSubmatch(strings.TrimSpace(ev.Find(".event_participants .amount").Text())); m != nil {
			l, _ := strconv.Atoi(m[1])
			e.Limit = int32(l)
		}
		if m := connpassTime.FindStringSubmatch(tm); year != "" && date != "" && m != nil {
			md := strings.SplitN(date, "/", 2)
			if len(md) == 2 {
				mo, _ := strconv.Atoi(md[0])
				d, _ := strconv.Atoi(md[1])
				y, _ := strconv.Atoi(year)
				h, _ := strconv.Atoi(m[1])
				mi, _ := strconv.Atoi(m[2])
				e.StartedAt = time.Date(y, time.Month(mo), d, h, mi, 0, 0, jst.Location)
			}
		}
		out = append(out, e)
	})
	return out, nil
}
