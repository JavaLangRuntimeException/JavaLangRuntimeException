package gateway

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"strings"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/calendarsync/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/jst"
)

// 任意の URL に送らないよう、Discord の Webhook だけを受け付ける
var discordPrefixes = []string{"https://discord.com/api/webhooks/", "https://discordapp.com/api/webhooks/"}

const (
	discordUsername = "taramanji カレンダー"
	// Discord の embed の上限（title 256・field の value 1024 文字）
	maxTitle = 256
	maxField = 1024
	// 埋め込みの色（Google カレンダーの青）
	discordColor = 0x4285F4
)

type discord struct {
	http  *http.Client
	url   string
	clock func() time.Time
}

// NewDiscord は Discord の Webhook に送る Notifier。URL が Discord の Webhook でなければエラー
func NewDiscord(webhookURL string, clock func() time.Time) (gateway.Notifier, error) {
	ok := false
	for _, p := range discordPrefixes {
		if strings.HasPrefix(webhookURL, p) {
			ok = true
		}
	}
	if !ok {
		return nil, fmt.Errorf("DISCORD_WEBHOOK_URL must start with %s", discordPrefixes[0])
	}
	if clock == nil {
		clock = time.Now
	}
	// httpx（APM 計装）は使わない。Webhook の URL はパスにトークンを含み、span の http.url として Datadog に残ってしまう
	return &discord{http: &http.Client{Timeout: 10 * time.Second}, url: webhookURL, clock: clock}, nil
}

type embedField struct {
	Name   string `json:"name"`
	Value  string `json:"value"`
	Inline bool   `json:"inline,omitempty"`
}

type embed struct {
	Title       string       `json:"title"`
	URL         string       `json:"url,omitempty"`
	Description string       `json:"description"`
	Color       int          `json:"color"`
	Fields      []embedField `json:"fields,omitempty"`
	Timestamp   string       `json:"timestamp"`
}

type webhookPayload struct {
	Username string  `json:"username"`
	Content  string  `json:"content"`
	Embeds   []embed `json:"embeds"`
	// 予定の件名に @everyone などが入っていても誰も呼び出さない
	AllowedMentions struct {
		Parse []string `json:"parse"`
	} `json:"allowed_mentions"`
}

func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n-1]) + "…"
}

// timeRange は「10:30〜11:00」。日をまたぐときは終わりに日付を付ける
func timeRange(start, end time.Time) string {
	s, e := start.In(jst.Location), end.In(jst.Location)
	if end.IsZero() {
		return s.Format("15:04")
	}
	if jst.Date(s) != jst.Date(e) {
		return s.Format("15:04") + "〜" + e.Format("1/2 15:04")
	}
	return s.Format("15:04") + "〜" + e.Format("15:04")
}

func (d *discord) payload(r gateway.Reminder) webhookPayload {
	title := r.Summary
	if title == "" {
		title = "（タイトルなし）"
	}
	mins := int(math.Ceil(r.Start.Sub(d.clock()).Minutes()))
	if mins < 0 {
		mins = 0
	}
	e := embed{
		Title:       truncate(title, maxTitle),
		Description: fmt.Sprintf("**%s**（あと %d 分）", timeRange(r.Start, r.End), mins),
		Color:       discordColor,
		Timestamp:   r.Start.UTC().Format(time.RFC3339),
	}
	if r.MeetLink != "" {
		e.URL = r.MeetLink
		e.Fields = append(e.Fields, embedField{Name: "Meet", Value: truncate(r.MeetLink, maxField)})
	}
	if r.Location != "" {
		e.Fields = append(e.Fields, embedField{Name: "場所", Value: truncate(r.Location, maxField)})
	}
	e.Fields = append(e.Fields, embedField{Name: "カレンダー", Value: truncate(r.CalendarID, maxField), Inline: true})
	p := webhookPayload{Username: discordUsername, Content: fmt.Sprintf("⏰ %d 分後に予定があります", mins), Embeds: []embed{e}}
	p.AllowedMentions.Parse = []string{}
	return p
}

func (d *discord) Notify(ctx context.Context, r gateway.Reminder) error {
	body, err := json.Marshal(d.payload(r))
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, d.url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := d.http.Do(req)
	if err != nil {
		// URL（トークンを含む）をエラーに残さない
		return fmt.Errorf("discord webhook: request failed")
	}
	defer res.Body.Close()
	text, _ := io.ReadAll(io.LimitReader(res.Body, 4<<10))
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		// 429 も含め、送れなかった通知は印を外して次の回（5 分後）に送り直す
		return fmt.Errorf("discord webhook: HTTP %d: %s", res.StatusCode, truncate(string(text), maxErrText))
	}
	return nil
}
