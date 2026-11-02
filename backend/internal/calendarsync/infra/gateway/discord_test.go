package gateway

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/calendarsync/domain/gateway"
)

func TestNewDiscordRejectsOtherURLs(t *testing.T) {
	for _, u := range []string{"https://example.com/api/webhooks/1/x", "http://discord.com/api/webhooks/1/x", "https://discord.com.evil.example/api/webhooks/"} {
		if _, err := NewDiscord(u, nil); err == nil {
			t.Errorf("%s should be rejected", u)
		}
	}
	if _, err := NewDiscord("https://discord.com/api/webhooks/123/abc", nil); err != nil {
		t.Fatal(err)
	}
}

func TestDiscordNotify(t *testing.T) {
	var got webhookPayload
	status := http.StatusNoContent
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&got)
		w.WriteHeader(status)
	}))
	defer srv.Close()
	now := time.Date(2026, 10, 22, 1, 0, 0, 0, time.UTC) // 10:00 JST
	d := &discord{http: srv.Client(), url: srv.URL, clock: func() time.Time { return now }}
	r := gateway.Reminder{Summary: "@everyone 定例", CalendarID: "a@example.com", Start: now.Add(8 * time.Minute),
		End: now.Add(38 * time.Minute), MeetLink: "https://meet.google.com/abc-defg-hij", Location: "会議室 A"}
	if err := d.Notify(context.Background(), r); err != nil {
		t.Fatal(err)
	}
	e := got.Embeds[0]
	if got.Content != "⏰ 8 分後に予定があります" || e.Description != "**10:08〜10:38**（あと 8 分）" || e.URL != r.MeetLink ||
		len(e.Fields) != 3 || got.AllowedMentions.Parse == nil || len(got.AllowedMentions.Parse) != 0 {
		t.Fatalf("payload %+v", got)
	}
	status = http.StatusTooManyRequests
	if err := d.Notify(context.Background(), r); err == nil || !strings.Contains(err.Error(), "429") {
		t.Fatalf("err %v", err)
	}
}

func TestTimeRangeAcrossMidnight(t *testing.T) {
	s := time.Date(2026, 10, 22, 14, 30, 0, 0, time.UTC) // 23:30 JST
	if got := timeRange(s, s.Add(time.Hour)); got != "23:30〜10/23 00:30" {
		t.Fatal(got)
	}
}
