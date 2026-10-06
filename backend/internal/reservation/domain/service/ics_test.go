package service

import (
	"strings"
	"testing"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/jst"
)

func ics(events ...string) string {
	return "BEGIN:VCALENDAR\r\nVERSION:2.0\r\n" + strings.Join(events, "") + "END:VCALENDAR\r\n"
}

func vevent(lines ...string) string {
	return "BEGIN:VEVENT\r\n" + strings.Join(lines, "\r\n") + "\r\nEND:VEVENT\r\n"
}

// 2026-10-05（月）〜 10-12 の 1 週間（日本時間）
var (
	weekFrom = time.Date(2026, 10, 5, 0, 0, 0, 0, jst.Location)
	weekTo   = weekFrom.Add(week)
	parser   = NewIcsParser(540)
)

func isoList(ivs []Interval) []string {
	var out []string
	for _, iv := range ivs {
		out = append(out, FormatISO(iv.Start)+"/"+FormatISO(iv.End))
	}
	return out
}

func eq(t *testing.T, got []Interval, want ...string) {
	t.Helper()
	g := isoList(got)
	if strings.Join(g, ",") != strings.Join(want, ",") {
		t.Fatalf("got  %v\nwant %v", g, want)
	}
}

func TestEventsBasic(t *testing.T) {
	src := ics(
		vevent("DTSTART:20261006T010000Z", "DTEND:20261006T020000Z", "SUMMARY:UTC"),
		// TZID 付き・浮動時刻は日本時間として読む
		vevent("DTSTART;TZID=Asia/Tokyo:20261007T100000", "DTEND;TZID=Asia/Tokyo:20261007T110000", "SUMMARY:Local"),
		// 終日
		vevent("DTSTART;VALUE=DATE:20261008", "DTEND;VALUE=DATE:20261009"),
		// DURATION
		vevent("DTSTART:20261009T000000Z", "DURATION:PT1H30M"),
		// 予定なし（TRANSPARENT）は除く
		vevent("DTSTART:20261009T050000Z", "DTEND:20261009T060000Z", "TRANSP:TRANSPARENT"),
		// 範囲外
		vevent("DTSTART:20261020T010000Z", "DTEND:20261020T020000Z"),
	)
	got := parser.Events(src, weekFrom, weekTo)
	eq(t, got,
		"2026-10-06T01:00:00.000Z/2026-10-06T02:00:00.000Z",
		"2026-10-07T01:00:00.000Z/2026-10-07T02:00:00.000Z",
		"2026-10-07T15:00:00.000Z/2026-10-08T15:00:00.000Z",
		"2026-10-09T00:00:00.000Z/2026-10-09T01:30:00.000Z",
	)
	if got[0].Summary != "UTC" || got[2].Summary != untitled {
		t.Fatalf("summary: %q %q", got[0].Summary, got[2].Summary)
	}
}

func TestEventsFoldedLines(t *testing.T) {
	src := "BEGIN:VEVENT\r\nDTSTART:20261006T0100\r\n 00Z\r\nDTEND:20261006T020000Z\r\nSUMMARY:a\\, b\r\nEND:VEVENT\r\n"
	got := parser.Events(src, weekFrom, weekTo)
	eq(t, got, "2026-10-06T01:00:00.000Z/2026-10-06T02:00:00.000Z")
	if got[0].Summary != "a, b" {
		t.Fatalf("summary %q", got[0].Summary)
	}
}

func TestWeeklyRecurrence(t *testing.T) {
	src := ics(
		// 毎週 月・水 8:00〜9:00（日本時間）。UTC では日曜・火曜の 23:00 にあたる
		vevent("DTSTART;TZID=Asia/Tokyo:20260907T080000", "DTEND;TZID=Asia/Tokyo:20260907T090000",
			"RRULE:FREQ=WEEKLY;BYDAY=MO,WE", "EXDATE;TZID=Asia/Tokyo:20261007T080000"),
	)
	eq(t, parser.Events(src, weekFrom, weekTo),
		"2026-10-04T23:00:00.000Z/2026-10-05T00:00:00.000Z",
	)
}

func TestWeeklyIntervalAndUntil(t *testing.T) {
	src := ics(
		// 隔週の火曜。9/8 から 2 週ごと → 10/6 は該当
		vevent("DTSTART:20260908T010000Z", "DTEND:20260908T020000Z", "RRULE:FREQ=WEEKLY;INTERVAL=2"),
		// UNTIL を過ぎた繰り返しは出ない
		vevent("DTSTART:20260901T030000Z", "DTEND:20260901T040000Z", "RRULE:FREQ=WEEKLY;UNTIL=20260930T000000Z"),
		// COUNT を使い切った繰り返しは出ない（2017 年の COUNT=1 の予定が毎週出ていた不具合）
		vevent("DTSTART;TZID=Asia/Tokyo:20170801T083000", "DTEND;TZID=Asia/Tokyo:20170801T123000", "RRULE:FREQ=WEEKLY;WKST=SU;COUNT=1;BYDAY=TU,WE,TH"),
		// COUNT 内なら出る（9/29 火から 2 回 → 10/6 は 2 回目）
		vevent("DTSTART:20260929T070000Z", "DTEND:20260929T080000Z", "RRULE:FREQ=WEEKLY;COUNT=2"),
		// 開始前の曜日は出さない（10/7 水 開始、BYDAY=MO,WE → 10/5 月は出ない）
		vevent("DTSTART:20261007T050000Z", "DTEND:20261007T060000Z", "RRULE:FREQ=WEEKLY;BYDAY=MO,WE"),
	)
	eq(t, parser.Events(src, weekFrom, weekTo),
		"2026-10-06T01:00:00.000Z/2026-10-06T02:00:00.000Z",
		"2026-10-06T07:00:00.000Z/2026-10-06T08:00:00.000Z",
		"2026-10-07T05:00:00.000Z/2026-10-07T06:00:00.000Z",
	)
}

func TestBusyBufferClipMerge(t *testing.T) {
	events := []Interval{
		{Start: weekFrom.Add(10 * time.Hour), End: weekFrom.Add(11 * time.Hour)},
		{Start: weekFrom.Add(12 * time.Hour), End: weekFrom.Add(13 * time.Hour)}, // 前後 30 分で前とつながる
		{Start: weekFrom.Add(-time.Hour), End: weekFrom.Add(10 * time.Minute)},   // 週の前から
		{Start: weekFrom.Add(20 * time.Hour), End: weekFrom.Add(21 * time.Hour)},
	}
	eq(t, Busy(events, weekFrom, weekTo, BusyBuffer),
		"2026-10-04T15:00:00.000Z/2026-10-04T15:40:00.000Z",
		"2026-10-05T00:30:00.000Z/2026-10-05T04:30:00.000Z",
		"2026-10-05T10:30:00.000Z/2026-10-05T12:30:00.000Z",
	)
	eq(t, Busy(events[:1], weekFrom, weekTo, 0), "2026-10-05T01:00:00.000Z/2026-10-05T02:00:00.000Z")
}

func TestWeekStart(t *testing.T) {
	// 日曜の夜（日本時間）でも今週の月曜を返す
	now := time.Date(2026, 10, 11, 23, 0, 0, 0, jst.Location)
	if got := FormatISO(WeekStart("", now)); got != "2026-10-04T15:00:00.000Z" {
		t.Fatalf("WeekStart = %s", got)
	}
	if got := FormatISO(WeekStart("2026-10-11T15:00:00.000Z", now)); got != "2026-10-11T15:00:00.000Z" {
		t.Fatalf("WeekStart(iso) = %s", got)
	}
}
