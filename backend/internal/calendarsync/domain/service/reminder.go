package service

import (
	"crypto/sha256"
	"encoding/hex"
	"sort"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/calendarsync/domain/gateway"
)

// DueReminders は開始が (now, now+lead] に入る予定。同期元と同じ条件（確定・仮・不参加でない・同期予定でない）で選び、
// 終日予定は除く。CronJob は 5 分ごとなので、10 分前の窓なら各予定は開始の 5〜10 分前にちょうど 1 回この窓に入る
func DueReminders(calendarID string, events []gateway.Event, now time.Time, lead time.Duration) []gateway.Reminder {
	var out []gateway.Reminder
	for _, e := range SourceEvents(events) {
		start, err := time.Parse(time.RFC3339, e.Start.DateTime())
		if err != nil {
			continue
		}
		if !start.After(now) || start.After(now.Add(lead)) {
			continue
		}
		end, _ := time.Parse(time.RFC3339, e.End.DateTime())
		out = append(out, gateway.Reminder{
			Key: reminderKey(calendarID, e, start), CalendarID: calendarID, Summary: e.Summary,
			Start: start, End: end, Location: e.Location, MeetLink: e.HangoutLink,
		})
	}
	return out
}

// reminderKey は iCalUID（招待された全員で同じ）と開始時刻から作る。繰り返し予定は回ごとに iCalUID が同じなので開始時刻も混ぜる
func reminderKey(calendarID string, e gateway.Event, start time.Time) string {
	uid := e.ICalUID
	if uid == "" {
		uid = calendarID + "/" + e.ID
	}
	sum := sha256.Sum256([]byte(uid + "@" + start.UTC().Format(time.RFC3339)))
	return hex.EncodeToString(sum[:16])
}

// MergeReminders は複数アカウントの通知をキーで 1 つにまとめ、始まる順に並べる（先に接続したアカウントの方を残す）
func MergeReminders(lists ...[]gateway.Reminder) []gateway.Reminder {
	seen := map[string]bool{}
	var out []gateway.Reminder
	for _, l := range lists {
		for _, r := range l {
			if seen[r.Key] {
				continue
			}
			seen[r.Key] = true
			out = append(out, r)
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Start.Before(out[j].Start) })
	return out
}
