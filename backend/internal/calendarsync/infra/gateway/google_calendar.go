// Package gateway は calendarsync の外部実装（Google Calendar API・Google ToDo API・OAuth・暗号化・Redis の実行状態）。
package gateway

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"time"

	"golang.org/x/oauth2"

	"github.com/javalangruntimeexception/taramanji/backend/internal/calendarsync/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/calendarsync/domain/service"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/httpx"
)

const (
	calendarAPI = "https://www.googleapis.com/calendar/v3"
	tasksAPI    = "https://tasks.googleapis.com/tasks/v1"
	maxRetries  = 4
	maxErrText  = 500
)

// APIError は Google API のエラー応答（旧実装の GoogleApiError と同じメッセージ）
type APIError struct {
	Status int
	Body   string
}

func (e *APIError) Error() string { return fmt.Sprintf("Google API HTTP %d: %s", e.Status, e.Body) }

func statusOf(err error) int {
	if e, ok := err.(*APIError); ok {
		return e.Status
	}
	return 0
}

var rateLimited = regexp.MustCompile(`rateLimitExceeded|userRateLimitExceeded`)

// client は 1 アカウント分の Google Calendar API クライアント
type client struct {
	http  *http.Client
	sleep func(time.Duration)
}

// do は 429 / 5xx と、Calendar API が 403 で返すレート制限を待って再試行する
func (c *client) do(ctx context.Context, method, target string, body any, out any) error {
	var payload []byte
	if body != nil {
		var err error
		if payload, err = json.Marshal(body); err != nil {
			return err
		}
	}
	for attempt := 0; ; attempt++ {
		req, err := http.NewRequestWithContext(ctx, method, target, bytes.NewReader(payload))
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", "application/json")
		res, err := c.http.Do(req)
		if err != nil {
			return err
		}
		text, _ := io.ReadAll(io.LimitReader(res.Body, 8<<20))
		res.Body.Close()
		if res.StatusCode >= 200 && res.StatusCode < 300 {
			if out != nil && len(text) > 0 {
				return json.Unmarshal(text, out)
			}
			return nil
		}
		retry := res.StatusCode == http.StatusTooManyRequests || res.StatusCode >= 500 ||
			(res.StatusCode == http.StatusForbidden && rateLimited.Match(text))
		if retry && attempt < maxRetries {
			c.sleep(time.Duration(1<<attempt) * time.Second)
			continue
		}
		if len(text) > maxErrText {
			text = text[:maxErrText]
		}
		return &APIError{Status: res.StatusCode, Body: string(text)}
	}
}

// calendar は接続したアカウント自身のメインカレンダー（ID はメールアドレス）と Google ToDo
type calendar struct {
	client
	id        string
	base      string
	tasksBase string
}

func (c *calendar) ID() string { return c.id }

func (c *calendar) path(suffix string) string {
	return c.base + "/calendars/" + url.PathEscape(c.id) + "/events" + suffix
}

func (c *calendar) Events(ctx context.Context, start, end time.Time) ([]gateway.Event, error) {
	q := url.Values{"singleEvents": {"true"}, "showDeleted": {"false"}, "maxResults": {"2500"},
		"timeMin": {service.FormatISO(start)}, "timeMax": {service.FormatISO(end)}}
	var out []gateway.Event
	for {
		var page struct {
			Items         []gateway.Event `json:"items"`
			NextPageToken string          `json:"nextPageToken"`
		}
		if err := c.do(ctx, http.MethodGet, c.path("?"+q.Encode()), nil, &page); err != nil {
			return nil, err
		}
		out = append(out, page.Items...)
		if page.NextPageToken == "" {
			return out, nil
		}
		q.Set("pageToken", page.NextPageToken)
	}
}

func (c *calendar) Upsert(ctx context.Context, eventID string, body gateway.MirrorBody, isNew bool) error {
	data := service.BodyMap(body)
	data["id"] = eventID
	put := func() error { return c.do(ctx, http.MethodPut, c.path("/"+eventID), data, nil) }
	insert := func() error {
		err := c.do(ctx, http.MethodPost, c.path(""), data, nil)
		if statusOf(err) == http.StatusConflict {
			return put() // 既にある
		}
		return err
	}
	if isNew {
		// まだ作っていないはずの予定は作成から（更新→404→作成の 2 往復を省く）
		return insert()
	}
	err := put()
	if statusOf(err) == http.StatusNotFound {
		return insert()
	}
	return err
}

func (c *calendar) Delete(ctx context.Context, eventID string) error {
	err := c.do(ctx, http.MethodDelete, c.path("/"+eventID), nil, nil)
	if s := statusOf(err); s == http.StatusNotFound || s == http.StatusGone {
		return nil
	}
	return err
}

// insufficientScope は許可していないスコープの API を呼んだときの 403
var insufficientScope = regexp.MustCompile(`ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficientPermissions`)

func (c *calendar) Tasks(ctx context.Context, dueMin, dueMax time.Time) ([]gateway.Task, error) {
	out, err := c.tasks(ctx, dueMin, dueMax)
	if e, ok := err.(*APIError); ok && e.Status == http.StatusForbidden && insufficientScope.MatchString(e.Body) {
		return nil, gateway.ErrTasksNotGranted
	}
	return out, err
}

func (c *calendar) tasks(ctx context.Context, dueMin, dueMax time.Time) ([]gateway.Task, error) {
	var lists []string
	q := url.Values{"maxResults": {"100"}}
	for {
		var page struct {
			Items []struct {
				ID string `json:"id"`
			} `json:"items"`
			NextPageToken string `json:"nextPageToken"`
		}
		if err := c.do(ctx, http.MethodGet, c.tasksBase+"/users/@me/lists?"+q.Encode(), nil, &page); err != nil {
			return nil, err
		}
		for _, l := range page.Items {
			lists = append(lists, l.ID)
		}
		if page.NextPageToken == "" {
			break
		}
		q.Set("pageToken", page.NextPageToken)
	}
	var out []gateway.Task
	for _, list := range lists {
		q := url.Values{"maxResults": {"100"}, "showCompleted": {"false"}, "showHidden": {"false"}, "showDeleted": {"false"},
			"dueMin": {service.FormatISO(dueMin)}, "dueMax": {service.FormatISO(dueMax)}}
		for {
			var page struct {
				Items []struct {
					ID          string `json:"id"`
					Title       string `json:"title"`
					Notes       string `json:"notes"`
					Due         string `json:"due"`
					Status      string `json:"status"`
					WebViewLink string `json:"webViewLink"`
				} `json:"items"`
				NextPageToken string `json:"nextPageToken"`
			}
			if err := c.do(ctx, http.MethodGet, c.tasksBase+"/lists/"+url.PathEscape(list)+"/tasks?"+q.Encode(), nil, &page); err != nil {
				return nil, err
			}
			for _, t := range page.Items {
				// due は「日付の 0 時（UTC）」の RFC 3339。日付だけ使う
				if t.Status != "needsAction" || len(t.Due) < len(time.DateOnly) {
					continue
				}
				out = append(out, gateway.Task{ID: t.ID, Title: t.Title, Notes: t.Notes, Due: t.Due[:len(time.DateOnly)], WebViewLink: t.WebViewLink})
			}
			if page.NextPageToken == "" {
				break
			}
			q.Set("pageToken", page.NextPageToken)
		}
	}
	return out, nil
}

type connector struct{ cfg *oauth2.Config }

// NewConnector は更新トークンでつなぐ。つなぐ時点でアクセストークンを取り、失効を検出する
func NewConnector(cfg *oauth2.Config) gateway.Connector { return &connector{cfg: cfg} }

func (c *connector) Connect(ctx context.Context, calendarID, refreshToken string) (gateway.Calendar, error) {
	base := httpx.New(60 * time.Second)
	ctx = context.WithValue(ctx, oauth2.HTTPClient, base)
	ts := c.cfg.TokenSource(ctx, &oauth2.Token{RefreshToken: refreshToken})
	if _, err := ts.Token(); err != nil {
		return nil, err
	}
	hc := &http.Client{Transport: &oauth2.Transport{Source: oauth2.ReuseTokenSource(nil, ts), Base: base.Transport}, Timeout: base.Timeout}
	return &calendar{client: client{http: hc, sleep: time.Sleep}, id: calendarID, base: calendarAPI, tasksBase: tasksAPI}, nil
}
