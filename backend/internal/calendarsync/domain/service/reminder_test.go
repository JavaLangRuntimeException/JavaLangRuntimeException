package service

import (
	"testing"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/calendarsync/domain/gateway"
)

func timed(id, uid, start string) gateway.Event {
	s, _ := time.Parse(time.RFC3339, start)
	return gateway.Event{ID: id, ICalUID: uid, Status: "confirmed", Summary: id,
		Start: gateway.EventTime{"dateTime": start}, End: gateway.EventTime{"dateTime": s.Add(time.Hour).Format(time.RFC3339)}}
}

func TestDueReminders(t *testing.T) {
	now := time.Date(2026, 10, 22, 10, 0, 0, 0, time.UTC)
	declined := timed("declined", "", "2026-10-22T10:05:00Z")
	declined.Attendees = []gateway.Attendee{{Self: true, ResponseStatus: "declined"}}
	mirror := timed("mirror", "", "2026-10-22T10:05:00Z")
	mirror.ExtendedProperties = &gateway.ExtendedProperty{Private: map[string]string{Marker: "x"}}
	cancelled := timed("cancelled", "", "2026-10-22T10:05:00Z")
	cancelled.Status = "cancelled"
	allDay := gateway.Event{ID: "allday", Status: "confirmed", Start: gateway.EventTime{"date": "2026-10-22"}, End: gateway.EventTime{"date": "2026-10-23"}}
	events := []gateway.Event{
		timed("started", "", "2026-10-22T10:00:00Z"),  // ちょうどいま始まった → 前の回で送っている
		timed("in5", "", "2026-10-22T19:05:00+09:00"), // 5 分後（JST の表記）
		timed("in10", "", "2026-10-22T10:10:00Z"),     // ちょうど 10 分後 → 含める
		timed("in11", "", "2026-10-22T10:11:00Z"),     // 窓の外 → 次の回
		declined, mirror, cancelled, allDay,
	}
	got := DueReminders("a@example.com", events, now, 10*time.Minute)
	var ids []string
	for _, r := range got {
		ids = append(ids, r.Summary)
	}
	if len(ids) != 2 || ids[0] != "in5" || ids[1] != "in10" {
		t.Fatalf("got %v", ids)
	}
	if got[0].End.Sub(got[0].Start) != time.Hour || got[0].CalendarID != "a@example.com" {
		t.Fatalf("reminder %+v", got[0])
	}
}

func TestMergeRemindersDedupesSameMeeting(t *testing.T) {
	now := time.Date(2026, 10, 22, 10, 0, 0, 0, time.UTC)
	// 2 つのアカウントに招待された同じ会議（iCalUID が同じ）は 1 回だけ。先のアカウントを残す
	a := DueReminders("a@example.com", []gateway.Event{timed("x", "meeting@google.com", "2026-10-22T10:08:00Z")}, now, 10*time.Minute)
	b := DueReminders("b@example.com", []gateway.Event{
		timed("y", "meeting@google.com", "2026-10-22T10:08:00Z"),
		timed("z", "", "2026-10-22T10:03:00Z"),
	}, now, 10*time.Minute)
	got := MergeReminders(a, b)
	if len(got) != 2 || got[0].Summary != "z" || got[1].CalendarID != "a@example.com" {
		t.Fatalf("got %+v", got)
	}
	// 繰り返し予定の別の回は別の通知
	other := DueReminders("a@example.com", []gateway.Event{timed("x2", "meeting@google.com", "2026-10-22T10:09:00Z")}, now, 10*time.Minute)
	if other[0].Key == a[0].Key {
		t.Fatal("recurring instances must have different keys")
	}
}
