// Package service は複数の Google アカウントのメインカレンダーを「予定あり」で相互に同期するドメインロジック。
// calendar-busy-sync（busy_sync.py）→ 旧実装（reconcile.ts）の移植。予定 ID・識別マーカー・ダイジェストは同じなので、
// これまでに作った同期予定をそのまま引き継げる。
package service

import (
	"context"
	"encoding/json"
	"errors"
	"sort"
	"sync"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/calendarsync/domain/gateway"
)

const (
	// Marker は同期予定に付ける extendedProperties.private のキー
	Marker = "busy_sync_origin"
	busy   = "予定あり"
	// freeSlot はマスターの空き時間を他のカレンダーへ出すときの件名
	freeSlot = "予定あり（MTG可能）"
	untitled = "(タイトルなし)"
	day      = 24 * time.Hour
)

// ErrTooFewAccounts は接続が 2 つ未満
var ErrTooFewAccounts = errors.New("At least two accounts must be connected")

// Mirror は作った同期予定の記録（本文のダイジェストと、元予定の終了時刻）
type Mirror struct {
	Digest string
	EndAt  string
}

// Mirrors のキーは MirrorKey（JSON の [元カレンダー, 元予定 ID, 同期先]）
type Mirrors map[string]Mirror

type State struct {
	Master  string
	Mirrors Mirrors
}

type Result struct {
	SourceEvents int
	Mirrors      int
	Writes       int
	Deletes      int
	// Pending は時間切れで次回に回した書き込み
	Pending int
	Errors  []gateway.SyncError
}

type Options struct {
	Now            time.Time
	Days           int
	PrivateSources map[string]bool
	// Deadline を過ぎたら新しい書き込みをやめる（ゼロ値は期限なし）
	Deadline    time.Time
	Unavailable []string
	Concurrency int
	// Clock は期限の判定に使う「いま」（テスト用）
	Clock func() time.Time
}

func isFreeSlot(e gateway.Event) bool {
	// 終日予定や勤務場所は既定で「予定なし」。時間指定の「予定なし」だけを空き枠として扱う
	t := e.EventType
	if t == "" {
		t = "default"
	}
	return e.Transparency == "transparent" && e.Start.DateTime() != "" && t == "default"
}

// SourceEvents は同期元にする予定（確定・仮・不参加でない・同期予定でない）。順序は API の順
func SourceEvents(events []gateway.Event) []gateway.Event {
	var out []gateway.Event
	index := map[string]int{}
	for _, e := range events {
		transparency := e.Transparency
		if transparency == "" {
			transparency = "opaque"
		}
		if e.Status != "confirmed" && e.Status != "tentative" {
			continue
		}
		if transparency != "opaque" && !isFreeSlot(e) {
			continue
		}
		if e.Start == nil || e.End == nil {
			continue
		}
		if e.ExtendedProperties != nil && e.ExtendedProperties.Private[Marker] != "" {
			continue
		}
		declined := false
		for _, a := range e.Attendees {
			if a.Self && a.ResponseStatus == "declined" {
				declined = true
			}
		}
		if declined {
			continue
		}
		// 同じ ID が 2 回来たら後の内容で上書きする（旧実装のオブジェクトと同じ）
		if i, ok := index[e.ID]; ok {
			out[i] = e
			continue
		}
		index[e.ID] = len(out)
		out = append(out, e)
	}
	return out
}

func strPtr(s string) *string { return &s }

// BuildMirrorBody は同期予定の本文。マスター宛て（detailed）には中身を、それ以外には「予定あり」だけを書く
func BuildMirrorBody(sourceID string, e gateway.Event, detailed, private bool) gateway.MirrorBody {
	b := gateway.MirrorBody{
		Summary: busy, Start: e.Start, End: e.End, Transparency: "opaque", Visibility: "private",
		Marker: map[string]string{Marker: sourceID + ":" + e.ID},
	}
	if e.Transparency == "transparent" {
		// マスターの空き時間は、他のカレンダーへ打ち合わせ可能な枠として出す
		b.Summary, b.Transparency = freeSlot, "transparent"
	}
	if detailed {
		// 中身だけコピーする。参加者をコピーすると Google が招待メールを送ってしまう
		b.Summary = e.Summary
		if b.Summary == "" {
			b.Summary = untitled
		}
		if private {
			b.Visibility = "private"
		} else {
			b.Visibility = "default"
		}
		var notes []string
		for _, n := range []string{e.Description, meetNote(e.HangoutLink), "元のカレンダー: " + sourceID} {
			if n != "" {
				notes = append(notes, n)
			}
		}
		b.Description = strPtr(joinNotes(notes))
		if e.Location != "" {
			b.Location = strPtr(e.Location)
		}
	}
	return b
}

func meetNote(link string) string {
	if link == "" {
		return ""
	}
	return "Google Meet: " + link
}

func joinNotes(notes []string) string {
	out := ""
	for i, n := range notes {
		if i > 0 {
			out += "\n\n"
		}
		out += n
	}
	return out
}

func eventTimeMap(t gateway.EventTime) map[string]any {
	m := make(map[string]any, len(t))
	for k, v := range t {
		m[k] = v
	}
	return m
}

// BodyMap は本文を Google Calendar API に送る JSON の形（ダイジェストもこの形で計算する）
func BodyMap(b gateway.MirrorBody) map[string]any {
	marker := map[string]any{}
	for k, v := range b.Marker {
		marker[k] = v
	}
	m := map[string]any{
		"summary": b.Summary, "start": eventTimeMap(b.Start), "end": eventTimeMap(b.End),
		"transparency": b.Transparency, "visibility": b.Visibility,
		"reminders":          map[string]any{"useDefault": false, "overrides": []any{}},
		"extendedProperties": map[string]any{"private": marker},
	}
	if b.Description != nil {
		m["description"] = *b.Description
	}
	if b.Location != nil {
		m["location"] = *b.Location
	}
	return m
}

// Digest は本文のダイジェスト（変化がなければ書き込まない）
func Digest(b gateway.MirrorBody) string { return sha256Hex(stableStringify(BodyMap(b))) }

// EventEnd は予定の終了時刻。終日予定は現地の 0 時で、UTC+14 を仮定すると最も早い時刻になる
func EventEnd(e gateway.Event) time.Time {
	if dt := e.End.DateTime(); dt != "" {
		if t, err := time.Parse(time.RFC3339, dt); err == nil {
			return t
		}
	}
	if t, err := time.Parse(time.DateOnly, e.End.Date()); err == nil {
		return t.Add(-14 * time.Hour)
	}
	return time.Time{}
}

// FormatISO は toISOString() と同じ形（UTC・ミリ秒付き）
func FormatISO(t time.Time) string { return t.UTC().Format("2006-01-02T15:04:05.000Z") }

// ParseKey は MirrorKey を [元カレンダー, 元予定 ID, 同期先] に戻す
func ParseKey(key string) (source, event, target string, ok bool) {
	var parts []string
	if json.Unmarshal([]byte(key), &parts) != nil || len(parts) != 3 {
		return "", "", "", false
	}
	return parts[0], parts[1], parts[2], true
}

type task struct {
	key, digest, endAt string
	target             gateway.Calendar
	id                 string
	body               gateway.MirrorBody
}

// Reconcile は全カレンダーを読み終えてから書き込む。途中で失敗・時間切れになっても再実行で収束する。
//   - 予定を読めなかったカレンダー（Unavailable を含む）が関わる同期は、作成も削除もせずそのまま持ち越す
//   - Deadline を過ぎたら新しい書き込みをやめ、次回に回す
func Reconcile(ctx context.Context, calendars []gateway.Calendar, state *State, opt Options) (Result, error) {
	if opt.Days == 0 {
		opt.Days = 90
	}
	if opt.Concurrency <= 0 {
		opt.Concurrency = 6
	}
	if opt.Clock == nil {
		opt.Clock = time.Now
	}
	if opt.Now.IsZero() {
		opt.Now = opt.Clock()
	}
	down := map[string]bool{}
	for _, id := range opt.Unavailable {
		down[id] = true
	}
	if len(calendars)+len(down) < 2 {
		return Result{}, ErrTooFewAccounts
	}
	windowStart := opt.Now.Add(-day)
	windowEnd := opt.Now.Add(time.Duration(opt.Days) * day)
	var res Result

	originals := map[string][]gateway.Event{}
	uids := map[string]map[string]bool{}
	for _, cal := range calendars {
		events, err := cal.Events(ctx, windowStart, windowEnd)
		if err != nil {
			down[cal.ID()] = true
			res.Errors = append(res.Errors, gateway.SyncError{CalendarID: cal.ID(), Error: err.Error()})
			continue
		}
		originals[cal.ID()] = SourceEvents(events)
		uids[cal.ID()] = map[string]bool{}
		for _, e := range originals[cal.ID()] {
			if e.ICalUID != "" {
				uids[cal.ID()][e.ICalUID] = true
			}
		}
	}
	var live []gateway.Calendar
	byID := map[string]gateway.Calendar{}
	for _, c := range calendars {
		byID[c.ID()] = c
		if !down[c.ID()] {
			live = append(live, c)
		}
	}
	previous := state.Mirrors
	if previous == nil {
		previous = Mirrors{}
	}
	desired := Mirrors{}
	var tasks []task

	for _, source := range live {
		for _, e := range originals[source.ID()] {
			endAt := FormatISO(EventEnd(e))
			for _, target := range live {
				if source.ID() == target.ID() {
					continue
				}
				if e.Transparency == "transparent" && state.Master != source.ID() && state.Master != target.ID() {
					continue // 空き枠はマスターとの間でだけ同期する
				}
				if e.ICalUID != "" && uids[target.ID()][e.ICalUID] {
					continue // 同じ招待が同期先にもある
				}
				body := BuildMirrorBody(source.ID(), e, target.ID() == state.Master && state.Master != "", opt.PrivateSources[source.ID()])
				digest := Digest(body)
				key := MirrorKey(source.ID(), e.ID, target.ID())
				if prev, ok := previous[key]; ok && prev.Digest == digest {
					desired[key] = Mirror{Digest: digest, EndAt: endAt}
					continue
				}
				tasks = append(tasks, task{key: key, digest: digest, endAt: endAt, target: target,
					id: MirrorID(source.ID(), e.ID, target.ID()), body: body})
			}
		}
	}

	// 書き込みは並行して送る。時間切れや失敗した分は前回の記録のまま残し、次回やり直す
	var mu sync.Mutex
	next := 0
	worker := func() {
		for {
			mu.Lock()
			if next >= len(tasks) {
				mu.Unlock()
				return
			}
			t := tasks[next]
			next++
			before, had := previous[t.key]
			if !opt.Deadline.IsZero() && opt.Clock().After(opt.Deadline) {
				res.Pending++
				if had {
					desired[t.key] = before
				}
				mu.Unlock()
				continue
			}
			mu.Unlock()
			err := t.target.Upsert(ctx, t.id, t.body, !had)
			mu.Lock()
			if err != nil {
				res.Errors = append(res.Errors, gateway.SyncError{CalendarID: t.target.ID(), Error: err.Error()})
				if had {
					desired[t.key] = before
				}
			} else {
				res.Writes++
				desired[t.key] = Mirror{Digest: t.digest, EndAt: t.endAt}
			}
			mu.Unlock()
		}
	}
	workers := min(opt.Concurrency, len(tasks))
	var wg sync.WaitGroup
	for range max(1, workers) {
		wg.Add(1)
		go func() { defer wg.Done(); worker() }()
	}
	wg.Wait()

	keys := make([]string, 0, len(previous))
	for k := range previous {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, key := range keys {
		value := previous[key]
		if _, ok := desired[key]; ok {
			continue
		}
		sourceID, eventID, targetID, ok := ParseKey(key)
		if !ok {
			continue // 壊れた記録は捨てる
		}
		if down[sourceID] || down[targetID] {
			desired[key] = value // 読めなかったカレンダーの分は判断できないので触らない
			continue
		}
		if end, err := time.Parse(time.RFC3339, value.EndAt); err == nil && !end.After(windowStart) {
			continue // 期間より前に終わった予定は、同期予定を残して記録だけ消す
		}
		target, ok := byID[targetID]
		if !ok {
			continue // 接続を解除したアカウント
		}
		if err := target.Delete(ctx, MirrorID(sourceID, eventID, targetID)); err != nil {
			res.Errors = append(res.Errors, gateway.SyncError{CalendarID: targetID, Error: err.Error()})
			desired[key] = value
			continue
		}
		res.Deletes++
	}

	state.Mirrors = desired
	for _, events := range originals {
		res.SourceEvents += len(events)
	}
	res.Mirrors = len(desired)
	return res, nil
}

// RemoveResult は接続解除で消した同期予定の数
type RemoveResult struct {
	Deleted, Failed int
	Remaining       Mirrors
}

// RemoveMirrorsIn は接続を解除するアカウントのカレンダーから、このアプリが作った同期予定を消す。
// 消せなかった分（トークン失効など）も含め、そのアカウント宛ての記録は Remaining から外す。
// そのアカウントの予定から作った他カレンダーの同期予定は、次回の同期で消える。
func RemoveMirrorsIn(ctx context.Context, target gateway.Calendar, mirrors Mirrors) RemoveResult {
	out := RemoveResult{Remaining: Mirrors{}}
	keys := make([]string, 0, len(mirrors))
	for k := range mirrors {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, key := range keys {
		sourceID, eventID, targetID, ok := ParseKey(key)
		if !ok || targetID != target.ID() {
			out.Remaining[key] = mirrors[key]
			continue
		}
		if err := target.Delete(ctx, MirrorID(sourceID, eventID, targetID)); err != nil {
			out.Failed++
			continue
		}
		out.Deleted++
	}
	return out
}

// DropTarget は同期先が targetID の記録を外す（トークン失効で消せないとき）
func DropTarget(mirrors Mirrors, targetID string) (remaining Mirrors, dropped int) {
	remaining = Mirrors{}
	for k, v := range mirrors {
		if _, _, t, ok := ParseKey(k); ok && t == targetID {
			dropped++
			continue
		}
		remaining[k] = v
	}
	return remaining, dropped
}
