package gateway

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"

	"github.com/javalangruntimeexception/taramanji/backend/internal/reservation/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/reservation/domain/service"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/errs"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/httpx"
)

const (
	calendarScope = "https://www.googleapis.com/auth/calendar"
	calendarAPI   = "https://www.googleapis.com/calendar/v3/calendars/"
)

// GoogleCredentials は Google Calendar API の認証情報。サービスアカウントを優先する（旧実装と同じ）
type GoogleCredentials struct {
	ServiceAccountJSONBase64 string
	ClientID                 string
	ClientSecret             string
	RefreshToken             string
}

// TokenSource は使える認証情報がなければ nil
func (c GoogleCredentials) TokenSource(ctx context.Context) (oauth2.TokenSource, error) {
	if c.ServiceAccountJSONBase64 != "" {
		raw, err := base64.StdEncoding.DecodeString(c.ServiceAccountJSONBase64)
		if err != nil {
			return nil, fmt.Errorf("GCAL_SA_JSON_BASE64: %w", err)
		}
		cfg, err := google.JWTConfigFromJSON(raw, calendarScope)
		if err != nil {
			return nil, fmt.Errorf("GCAL_SA_JSON_BASE64: %w", err)
		}
		return cfg.TokenSource(ctx), nil
	}
	if c.RefreshToken != "" && c.ClientID != "" && c.ClientSecret != "" {
		cfg := &oauth2.Config{ClientID: c.ClientID, ClientSecret: c.ClientSecret, Endpoint: google.Endpoint, Scopes: []string{calendarScope}}
		return cfg.TokenSource(ctx, &oauth2.Token{RefreshToken: c.RefreshToken}), nil
	}
	return nil, nil
}

// googleCalendar は Google Calendar API に直接書く経路
type googleCalendar struct {
	calendarID string
	tokens     oauth2.TokenSource
	client     *http.Client
	clock      func() time.Time
}

func NewGoogleCalendar(calendarID string, tokens oauth2.TokenSource, clock func() time.Time) gateway.Calendar {
	if clock == nil {
		clock = time.Now
	}
	return &googleCalendar{calendarID: calendarID, tokens: tokens, client: httpx.New(30 * time.Second), clock: clock}
}

func (g *googleCalendar) Name() string { return "google_calendar" }

type gDateTime struct {
	DateTime string `json:"dateTime"`
	TimeZone string `json:"timeZone"`
}

type gReminder struct {
	Method  string `json:"method"`
	Minutes int    `json:"minutes"`
}

type gConference struct {
	CreateRequest struct {
		RequestID             string `json:"requestId"`
		ConferenceSolutionKey struct {
			Type string `json:"type"`
		} `json:"conferenceSolutionKey"`
	} `json:"createRequest"`
}

type gEvent struct {
	Summary     string               `json:"summary,omitempty"`
	Description string               `json:"description,omitempty"`
	Location    *string              `json:"location,omitempty"`
	Start       *gDateTime           `json:"start,omitempty"`
	End         *gDateTime           `json:"end,omitempty"`
	Attendees   *[]map[string]string `json:"attendees,omitempty"`
	Reminders   *struct {
		UseDefault bool        `json:"useDefault"`
		Overrides  []gReminder `json:"overrides"`
	} `json:"reminders,omitempty"`
	ConferenceData *gConference `json:"conferenceData,omitempty"`
}

type gCreated struct {
	ID             string `json:"id"`
	HTMLLink       string `json:"htmlLink"`
	HangoutLink    string `json:"hangoutLink"`
	ConferenceData *struct {
		EntryPoints []struct {
			EntryPointType string `json:"entryPointType"`
			URI            string `json:"uri"`
		} `json:"entryPoints"`
	} `json:"conferenceData"`
}

func (c *gCreated) meetLink() string {
	if c.HangoutLink != "" {
		return c.HangoutLink
	}
	if c.ConferenceData != nil {
		for _, e := range c.ConferenceData.EntryPoints {
			if e.EntryPointType == "video" {
				return e.URI
			}
		}
	}
	return ""
}

func (g *googleCalendar) conference() *gConference {
	c := &gConference{}
	c.CreateRequest.RequestID = "req-" + strconv.FormatInt(g.clock().UnixMilli(), 10)
	c.CreateRequest.ConferenceSolutionKey.Type = "hangoutsMeet"
	return c
}

func (g *googleCalendar) eventsURL(eventID string, q url.Values) string {
	u := calendarAPI + url.PathEscape(g.calendarID) + "/events"
	if eventID != "" {
		u += "/" + url.PathEscape(eventID)
	}
	if len(q) > 0 {
		u += "?" + q.Encode()
	}
	return u
}

func (g *googleCalendar) request(ctx context.Context, method, target string, body any) (int, []byte, error) {
	tok, err := g.tokens.Token()
	if err != nil {
		return 0, nil, err
	}
	var r io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return 0, nil, err
		}
		r = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, target, r)
	if err != nil {
		return 0, nil, err
	}
	tok.SetAuthHeader(req)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := g.client.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	return res.StatusCode, b, nil
}

func ok(status int) bool { return status >= 200 && status < 300 }

// forbiddenForServiceAccounts は、ドメイン全体の委任なしのサービスアカウントは出席者を招待できないというエラーか
func forbiddenForServiceAccounts(status int, body []byte) bool {
	if status != http.StatusForbidden {
		return false
	}
	var e struct {
		Error struct {
			Errors []struct {
				Reason string `json:"reason"`
			} `json:"errors"`
		} `json:"error"`
	}
	return json.Unmarshal(body, &e) == nil && len(e.Error.Errors) > 0 && e.Error.Errors[0].Reason == "forbiddenForServiceAccounts"
}

func (g *googleCalendar) Create(ctx context.Context, e gateway.Event) (*gateway.Created, error) {
	location := e.Location
	attendees := []map[string]string{}
	for _, a := range e.Attendees {
		attendees = append(attendees, map[string]string{"email": a})
	}
	ev := gEvent{
		Summary: e.Summary, Description: e.Description, Location: &location,
		Start:     &gDateTime{DateTime: localDateTime(e.Start), TimeZone: "Asia/Tokyo"},
		End:       &gDateTime{DateTime: localDateTime(e.End), TimeZone: "Asia/Tokyo"},
		Attendees: &attendees,
	}
	ev.Reminders = &struct {
		UseDefault bool        `json:"useDefault"`
		Overrides  []gReminder `json:"overrides"`
	}{Overrides: []gReminder{{Method: "email", Minutes: 24 * 60}, {Method: "popup", Minutes: 10}}}
	if e.CreateMeet {
		ev.ConferenceData = g.conference()
	}
	q := url.Values{"sendUpdates": {"all"}}
	if e.CreateMeet {
		q.Set("conferenceDataVersion", "1")
	}
	status, body, err := g.request(ctx, http.MethodPost, g.eventsURL("", q), ev)
	if err != nil {
		return nil, errs.NewUpstreamError("google_calendar_api_request_failed", "", "").WithCause(err)
	}
	invited := len(attendees) > 0
	note := ""
	if !ok(status) {
		if !forbiddenForServiceAccounts(status, body) {
			return nil, errs.NewUpstreamError("google_insert_failed", "", "HTTP "+strconv.Itoa(status)+": "+string(body))
		}
		// サービスアカウントは出席者なし・通知なしで作り直す
		ev.Attendees = nil
		q.Set("sendUpdates", "none")
		s2, b2, err := g.request(ctx, http.MethodPost, g.eventsURL("", q), ev)
		if err != nil || !ok(s2) {
			return nil, errs.NewUpstreamError("google_insert_failed", "", "HTTP "+strconv.Itoa(status)+": "+string(body))
		}
		body, invited, note = b2, false, service.ServiceAccountNote
	}
	var created gCreated
	_ = json.Unmarshal(body, &created)
	out := &gateway.Created{EventID: created.ID, HTMLLink: created.HTMLLink, MeetLink: created.meetLink(), Invited: invited, Note: note}

	// 取消に使う EventID を説明文に足す（Meet が作られていなければここで作る）
	patch := gEvent{Description: service.WithEventID(e.Description, created.ID)}
	pq := url.Values{"sendUpdates": {"none"}}
	if e.CreateMeet {
		pq.Set("conferenceDataVersion", "1")
		if created.HangoutLink == "" {
			patch.ConferenceData = g.conference()
		}
	}
	if ps, pb, err := g.request(ctx, http.MethodPatch, g.eventsURL(created.ID, pq), patch); err == nil && ok(ps) {
		var patched gCreated
		if json.Unmarshal(pb, &patched) == nil {
			if patched.HTMLLink != "" {
				out.HTMLLink = patched.HTMLLink
			}
			out.MeetLink = patched.meetLink()
		}
	}
	return out, nil
}

func (g *googleCalendar) Get(ctx context.Context, eventID string) (*gateway.Created, error) {
	status, body, err := g.request(ctx, http.MethodGet, g.eventsURL(eventID, nil), nil)
	if err != nil {
		return nil, errs.NewUpstreamError("google_get_failed", "", "").WithCause(err)
	}
	if !ok(status) {
		return nil, errs.NewUpstreamError("google_get_failed", "", "HTTP "+strconv.Itoa(status)+": "+string(body))
	}
	var ev gCreated
	if err := json.Unmarshal(body, &ev); err != nil {
		return nil, errs.NewInternalError(err).WithCode("parse_failed")
	}
	return &gateway.Created{EventID: ev.ID, HTMLLink: ev.HTMLLink, MeetLink: ev.meetLink()}, nil
}

func (g *googleCalendar) Delete(ctx context.Context, eventID string) (bool, error) {
	status, body, err := g.request(ctx, http.MethodDelete, g.eventsURL(eventID, url.Values{"sendUpdates": {"all"}}), nil)
	if err != nil {
		return false, errs.NewUpstreamError("google_delete_failed", "", "").WithCause(err)
	}
	if status == http.StatusNotFound {
		return false, nil
	}
	if !ok(status) {
		return false, errs.NewUpstreamError("google_delete_failed", "", "HTTP "+strconv.Itoa(status)+": "+string(body))
	}
	return true, nil
}
