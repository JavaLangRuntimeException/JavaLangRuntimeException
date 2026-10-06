// Package service は予約のドメインルール（予約できる時間・件名と説明文）。
package service

import (
	"fmt"
	"strings"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/errs"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/jst"
)

const (
	// LeadTime は今から予約できるまでの最短時間
	LeadTime = 2 * time.Hour
	// UnavailableLocation は勤務場所がこの値の日は予約できない（src/shared/config/locations.ts と同じ）
	UnavailableLocation = "対応不可日・休日"
	// ServiceAccountNote は出席者を付けられなかったときの注記（旧 API と同じ文言）
	ServiceAccountNote = "Service Accountでのゲスト招待は未対応のため、出席者は追加されていません。"
)

type ClockTime struct {
	Hour   int
	Minute int
}

// Request は予約フォームの内容
type Request struct {
	Year, Month, Day   int
	Start, End         *ClockTime
	Name               string
	Email              string
	Purpose            string
	ContactMethod      string
	DiscordName        string
	DiscordServer      string
	SlackName          string
	SlackWorkspace     string
	OtherNote          string
	OfflinePlaceLink   string
	OfflinePlaceName   string
	OfflinePlaceDetail string
	MeetingNote        string
	Location           string
}

// StartAt / EndAt は日本時間の開始・終了。分の繰り上がりなどは time.Date と同じく正規化される
func (r Request) StartAt() time.Time { return r.at(r.Start) }
func (r Request) EndAt() time.Time   { return r.at(r.End) }

func (r Request) at(c *ClockTime) time.Time {
	return time.Date(r.Year, time.Month(r.Month), r.Day, c.Hour, c.Minute, 0, 0, jst.Location)
}

// DateKey は勤務場所の検索に使う日付（YYYY-MM-DD）
func (r Request) DateKey() string {
	return fmt.Sprintf("%04d-%02d-%02d", r.Year, r.Month, r.Day)
}

// WantsMeet は Google Meet を発行するか
func (r Request) WantsMeet() bool { return strings.ToLower(r.ContactMethod) == "meet" }

func (r Request) offline() bool { return strings.ToLower(r.ContactMethod) == "offline" }

// CheckTimes は開始・終了の指定があるか（旧 API の invalid_start_time / invalid_end_time）
func CheckTimes(r Request) error {
	if r.Start == nil {
		return errs.NewCodedError(errs.ErrorTypeBadRequest, "invalid_start_time", "開始時刻を指定してください")
	}
	if r.End == nil {
		return errs.NewCodedError(errs.ErrorTypeBadRequest, "invalid_end_time", "終了時刻を指定してください")
	}
	return nil
}

// CheckWindow は予約できる日時か（2 時間後以降・年末年始以外・対応不可日以外）を判定する。
// 旧 API はサーバーの TZ（UTC）で計算していて 9 時間ずれていたため、日本時間で判定する。
func CheckWindow(r Request, now time.Time, location string) error {
	if err := CheckTimes(r); err != nil {
		return err
	}
	start := r.StartAt()
	if start.Before(now.Add(LeadTime)) {
		return errs.NewCodedError(errs.ErrorTypeBadRequest, "lead_time_violation", "予約は現在から2時間後以降のみ可能です")
	}
	if IsHolidayPeriod(start) {
		return errs.NewCodedError(errs.ErrorTypeBadRequest, "holiday_period", "12/29-1/5の期間は予約できません")
	}
	if location == UnavailableLocation {
		return errs.NewCodedError(errs.ErrorTypeBadRequest, "location_unavailable", "対応不可日・休日は予約できません")
	}
	return nil
}

// IsHolidayPeriod は年末年始（12/29〜1/5）か
func IsHolidayPeriod(t time.Time) bool {
	t = t.In(jst.Location)
	m, d := t.Month(), t.Day()
	return (m == time.December && d >= 29) || (m == time.January && d <= 5)
}

func guest(name string) string {
	if name == "" {
		return "ゲスト"
	}
	return name
}

// calendarTitlePrefix は Google Calendar に直接書くときの件名の接頭辞（既定は TS+面談_）
var calendarTitlePrefix = map[string]string{
	"STECH":           "STECH面談_",
	"biwako.go":       "biwako.go_",
	"kyoto.go":        "kyoto.go_",
	"JINEN":           "JINEN_",
	"NxTEND_Event":    "NxTEND_",
	"NxTEND_Organize": "NxTEND運営_",
	"開発委託/相談":         "開発相談_",
	"出張撮影依頼":          "出張撮影_",
	"RCC":             "RCC_",
	"RM2C":            "RM2C_",
	"その他":             "面談_",
}

// CalendarSummary は Google Calendar 直結のときの件名
func CalendarSummary(purpose, name string) string {
	prefix, ok := calendarTitlePrefix[purpose]
	if !ok {
		prefix = "TS+面談_"
	}
	return prefix + guest(name) + "様"
}

// webhookTitlePrefix は GAS ウェブフック経由のときの件名の接頭辞（「x棚橋(taramanji)」が付く）
var webhookTitlePrefix = map[string]string{
	"TechSelect+":     "TS+面談_",
	"開発委託/相談":         "開発ご相談_",
	"STECH":           "STECHご相談_",
	"RM2C":            "RM2Cご相談_",
	"JINEN":           "コミュニティご相談_",
	"NxTEND_Event":    "NxTEND_Eventご相談_",
	"NxTEND_Organize": "NxTEND_Organizeご相談_",
	"biwako.go":       "biwako.goご相談_",
	"kyoto.go":        "kyoto.goご相談_",
	"RCC":             "RCCご相談_",
	"その他":             "ご相談_",
}

// WebhookSummary は GAS ウェブフック経由のときの件名
func WebhookSummary(purpose, name string) string {
	if prefix, ok := webhookTitlePrefix[purpose]; ok {
		return prefix + guest(name) + "様x棚橋(taramanji)"
	}
	return "ご相談_" + guest(name) + "様"
}

// Description は予定の説明文。withWorkspace=false（ウェブフック経由）では Discord サーバーと Slack ワークスペースを書かない
func Description(r Request, withWorkspace bool) string {
	lines := []string{"ご相談内容: " + r.Purpose}
	add := func(label, v string) {
		if v != "" {
			lines = append(lines, label+v)
		}
	}
	add("ご相談詳細(任意): ", r.MeetingNote)
	add("ミーティング媒体: ", r.ContactMethod)
	add("Discord名: ", r.DiscordName)
	if withWorkspace {
		add("Discordサーバー: ", r.DiscordServer)
	}
	add("Slack名: ", r.SlackName)
	if withWorkspace {
		add("Slackワークスペース: ", r.SlackWorkspace)
	}
	add("備考: ", r.OtherNote)
	if r.offline() {
		add("Googleマップ共有リンク: ", r.OfflinePlaceLink)
		add("場所の名称(自動入力): ", r.OfflinePlaceName)
		add("場所の詳細(任意): ", r.OfflinePlaceDetail)
	}
	return strings.Join(lines, "\n")
}

// WithEventID は予約後に説明文の末尾へ EventID を足す（取消に使うため）
func WithEventID(description, eventID string) string {
	if description == "" {
		return "EventID: " + eventID
	}
	return description + "\nEventID: " + eventID
}
