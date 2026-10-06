package service

import (
	"testing"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/errs"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/jst"
)

func req(y, m, d, h, min int) Request {
	return Request{Year: y, Month: m, Day: d, Start: &ClockTime{h, min}, End: &ClockTime{h + 1, min}}
}

func code(err error) string {
	if de, ok := errs.As(err); ok {
		return de.Code
	}
	return ""
}

func TestCheckWindow(t *testing.T) {
	now := time.Date(2026, 10, 6, 10, 0, 0, 0, jst.Location)
	cases := []struct {
		name     string
		r        Request
		location string
		want     string
	}{
		{"ちょうど 2 時間後は可", req(2026, 10, 6, 12, 0), "", ""},
		{"2 時間以内は不可（日本時間で判定）", req(2026, 10, 6, 11, 59), "", "lead_time_violation"},
		{"過去は不可", req(2026, 10, 5, 15, 0), "", "lead_time_violation"},
		{"12/29 は不可", req(2026, 12, 29, 10, 0), "", "holiday_period"},
		{"12/28 は可", req(2026, 12, 28, 10, 0), "", ""},
		{"1/5 は不可", req(2027, 1, 5, 10, 0), "", "holiday_period"},
		{"1/6 は可", req(2027, 1, 6, 10, 0), "", ""},
		{"対応不可日は不可", req(2026, 10, 7, 10, 0), UnavailableLocation, "location_unavailable"},
		{"他の勤務場所は可", req(2026, 10, 7, 10, 0), "京都", ""},
		{"開始なし", Request{Year: 2026, Month: 10, Day: 7, End: &ClockTime{10, 0}}, "", "invalid_start_time"},
		{"終了なし", Request{Year: 2026, Month: 10, Day: 7, Start: &ClockTime{10, 0}}, "", "invalid_end_time"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := code(CheckWindow(c.r, now, c.location)); got != c.want {
				t.Fatalf("got %q, want %q", got, c.want)
			}
		})
	}
}

func TestSummaries(t *testing.T) {
	cases := []struct{ purpose, name, calendar, webhook string }{
		{"TechSelect+", "山田", "TS+面談_山田様", "TS+面談_山田様x棚橋(taramanji)"},
		{"STECH", "", "STECH面談_ゲスト様", "STECHご相談_ゲスト様x棚橋(taramanji)"},
		{"開発委託/相談", "A", "開発相談_A様", "開発ご相談_A様x棚橋(taramanji)"},
		{"JINEN", "A", "JINEN_A様", "コミュニティご相談_A様x棚橋(taramanji)"},
		{"NxTEND_Organize", "A", "NxTEND運営_A様", "NxTEND_Organizeご相談_A様x棚橋(taramanji)"},
		{"出張撮影依頼", "A", "出張撮影_A様", "ご相談_A様"},
		{"その他", "A", "面談_A様", "ご相談_A様x棚橋(taramanji)"},
		{"unknown", "A", "TS+面談_A様", "ご相談_A様"},
	}
	for _, c := range cases {
		if got := CalendarSummary(c.purpose, c.name); got != c.calendar {
			t.Errorf("CalendarSummary(%q) = %q, want %q", c.purpose, got, c.calendar)
		}
		if got := WebhookSummary(c.purpose, c.name); got != c.webhook {
			t.Errorf("WebhookSummary(%q) = %q, want %q", c.purpose, got, c.webhook)
		}
	}
}

func TestDescription(t *testing.T) {
	r := Request{Purpose: "STECH", MeetingNote: "相談", ContactMethod: "discord", DiscordName: "taro", DiscordServer: "srv",
		OfflinePlaceLink: "https://maps.app.goo.gl/x"}
	if got, want := Description(r, true), "ご相談内容: STECH\nご相談詳細(任意): 相談\nミーティング媒体: discord\nDiscord名: taro\nDiscordサーバー: srv"; got != want {
		t.Errorf("calendar:\n%s\nwant:\n%s", got, want)
	}
	if got, want := Description(r, false), "ご相談内容: STECH\nご相談詳細(任意): 相談\nミーティング媒体: discord\nDiscord名: taro"; got != want {
		t.Errorf("webhook:\n%s\nwant:\n%s", got, want)
	}
	off := Request{Purpose: "その他", ContactMethod: "Offline", OfflinePlaceLink: "L", OfflinePlaceName: "N", OfflinePlaceDetail: "D", OtherNote: "x"}
	if got, want := Description(off, false), "ご相談内容: その他\nミーティング媒体: Offline\n備考: x\nGoogleマップ共有リンク: L\n場所の名称(自動入力): N\n場所の詳細(任意): D"; got != want {
		t.Errorf("offline:\n%s\nwant:\n%s", got, want)
	}
	if got := WithEventID("a", "id1"); got != "a\nEventID: id1" {
		t.Errorf("WithEventID = %q", got)
	}
}

func TestStartAtIsJST(t *testing.T) {
	r := req(2026, 10, 6, 9, 30)
	if got := r.StartAt().UTC().Format(time.RFC3339); got != "2026-10-06T00:30:00Z" {
		t.Fatalf("StartAt = %s", got)
	}
}
