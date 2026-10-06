// 旧実装 src/feature/calendar-sync/reconcile.test.ts（前半は calendar-busy-sync の tests/test_sync.py）の移植
package service

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"sort"
	"sync"
	"testing"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/calendarsync/domain/gateway"
)

type write struct {
	id   string
	body gateway.MirrorBody
}

type fakeCalendar struct {
	mu        sync.Mutex
	id        string
	items     []gateway.Event
	writes    []write
	deletes   []string
	newFlags  []bool
	failList  bool
	failWrite bool
}

func newFake(id string, items ...gateway.Event) *fakeCalendar {
	return &fakeCalendar{id: id, items: items}
}

func (f *fakeCalendar) ID() string { return f.id }
func (f *fakeCalendar) Events(context.Context, time.Time, time.Time) ([]gateway.Event, error) {
	if f.failList {
		return nil, errors.New("invalid_grant")
	}
	out := make([]gateway.Event, len(f.items))
	copy(out, f.items)
	return out, nil
}
func (f *fakeCalendar) Upsert(_ context.Context, id string, body gateway.MirrorBody, isNew bool) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.failWrite {
		return errors.New("HTTP 403")
	}
	f.writes = append(f.writes, write{id, body})
	f.newFlags = append(f.newFlags, isNew)
	return nil
}
func (f *fakeCalendar) Delete(_ context.Context, id string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.deletes = append(f.deletes, id)
	return nil
}
func (f *fakeCalendar) written(id string) *gateway.MirrorBody {
	var found *gateway.MirrorBody
	for i := range f.writes {
		if f.writes[i].id == id {
			found = &f.writes[i].body
		}
	}
	return found
}

func dt(s string) gateway.EventTime   { return gateway.EventTime{"dateTime": s} }
func date(s string) gateway.EventTime { return gateway.EventTime{"date": s} }

func event(id string, mod ...func(*gateway.Event)) gateway.Event {
	e := gateway.Event{ID: id, Status: "confirmed", Transparency: "opaque",
		Start: dt("2026-10-02T10:00:00+09:00"), End: dt("2026-10-02T11:00:00+09:00")}
	for _, m := range mod {
		m(&e)
	}
	return e
}

func summary(s string) func(*gateway.Event) { return func(e *gateway.Event) { e.Summary = s } }

type env struct {
	a, b  *fakeCalendar
	state *State
	now   time.Time
}

func setup() *env {
	return &env{
		a:     newFake("a@example.com", event("e1", summary("Secret A"), func(e *gateway.Event) { e.Description = "Private" })),
		b:     newFake("b@example.com", event("e2", summary("Secret B"))),
		state: &State{Mirrors: Mirrors{}},
		now:   time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC),
	}
}

func (s *env) sync(t *testing.T, cals []gateway.Calendar, opt Options) Result {
	t.Helper()
	if cals == nil {
		cals = []gateway.Calendar{s.a, s.b}
	}
	opt.Now = s.now
	res, err := Reconcile(context.Background(), cals, s.state, opt)
	if err != nil {
		t.Fatal(err)
	}
	return res
}

func keys(m Mirrors) []string {
	var out []string
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func TestBidirectionalPrivateIdempotent(t *testing.T) {
	s := setup()
	if got := s.sync(t, nil, Options{}).Mirrors; got != 2 {
		t.Fatalf("mirrors %d", got)
	}
	if len(s.a.writes) != 1 || len(s.b.writes) != 1 {
		t.Fatalf("writes %d %d", len(s.a.writes), len(s.b.writes))
	}
	w := s.b.writes[0]
	if w.id != MirrorID(s.a.id, "e1", s.b.id) || w.body.Summary != "予定あり" || w.body.Visibility != "private" ||
		w.body.Transparency != "opaque" || w.body.Description != nil || w.body.Marker[Marker] != "a@example.com:e1" {
		t.Fatalf("body %+v", w)
	}
	s.sync(t, nil, Options{})
	if len(s.a.writes) != 1 || len(s.b.writes) != 1 {
		t.Fatal("not idempotent")
	}
}

func TestMirrorIDMatchesPython(t *testing.T) {
	// python3 -c 'import hashlib,json; print("b"+hashlib.sha256(json.dumps(["a@example.com","e1","b@example.com"],separators=(",",":")).encode()).hexdigest())'
	if got := MirrorID("a@example.com", "e1", "b@example.com"); got != "bee6b3ce0502f1477e9b76d8dbffffe5792d6f2f6b53ae688c7f4ee24b8b1eb06" {
		t.Fatal(got)
	}
}

func TestUpdateAndDelete(t *testing.T) {
	s := setup()
	s.sync(t, nil, Options{})
	s.a.items[0].End = dt("2026-10-02T12:00:00+09:00")
	s.sync(t, nil, Options{})
	if len(s.b.writes) != 2 {
		t.Fatalf("writes %d", len(s.b.writes))
	}
	s.a.items = nil
	s.sync(t, nil, Options{})
	if !reflect.DeepEqual(s.b.deletes, []string{MirrorID(s.a.id, "e1", s.b.id)}) {
		t.Fatalf("deletes %v", s.b.deletes)
	}
	if !reflect.DeepEqual(keys(s.state.Mirrors), []string{`["b@example.com","e2","a@example.com"]`}) {
		t.Fatalf("mirrors %v", keys(s.state.Mirrors))
	}
}

func TestPastEventsKeepMirrors(t *testing.T) {
	s := setup()
	s.sync(t, nil, Options{})
	s.now = time.Date(2026, 10, 4, 0, 0, 0, 0, time.UTC)
	s.a.items, s.b.items = nil, nil
	s.sync(t, nil, Options{})
	if len(s.a.deletes)+len(s.b.deletes) != 0 || len(s.state.Mirrors) != 0 {
		t.Fatalf("deletes %v %v mirrors %v", s.a.deletes, s.b.deletes, s.state.Mirrors)
	}
}

func TestPastAllDayKeepsMirror(t *testing.T) {
	s := setup()
	s.a.items = []gateway.Event{event("all-day", func(e *gateway.Event) { e.Start, e.End = date("2026-10-02"), date("2026-10-03") })}
	s.b.items = nil
	s.sync(t, nil, Options{})
	s.now = time.Date(2026, 10, 3, 12, 0, 0, 0, time.UTC)
	s.a.items = nil
	s.sync(t, nil, Options{})
	if len(s.b.deletes) != 0 {
		t.Fatalf("deletes %v", s.b.deletes)
	}
}

func TestExcluded(t *testing.T) {
	s := setup()
	s.a.items = append(s.a.items,
		event("mirror", func(e *gateway.Event) {
			e.ExtendedProperties = &gateway.ExtendedProperty{Private: map[string]string{Marker: "x:y"}}
		}),
		event("free", func(e *gateway.Event) { e.Transparency = "transparent" }),
		event("declined", func(e *gateway.Event) {
			e.Attendees = []gateway.Attendee{{Self: true, ResponseStatus: "declined"}}
		}),
		event("shared", func(e *gateway.Event) { e.ICalUID = "same@example.com" }),
	)
	s.b.items = append(s.b.items, event("other-copy", func(e *gateway.Event) { e.ICalUID = "same@example.com" }))
	s.sync(t, nil, Options{})
	if len(s.b.writes) != 1 || len(s.a.writes) != 1 {
		t.Fatalf("writes %d %d", len(s.a.writes), len(s.b.writes))
	}
}

func TestAllDayKeepsDate(t *testing.T) {
	s := setup()
	s.a.items = []gateway.Event{event("all-day", func(e *gateway.Event) { e.Start, e.End = date("2026-10-02"), date("2026-10-03") })}
	s.sync(t, nil, Options{})
	if !reflect.DeepEqual(s.b.writes[0].body.Start, date("2026-10-02")) {
		t.Fatalf("start %v", s.b.writes[0].body.Start)
	}
}

func TestMasterGetsDetails(t *testing.T) {
	s := setup()
	s.a.items[0].Location = "Office"
	s.a.items[0].HangoutLink = "https://meet.google.com/x"
	s.a.items[0].Attendees = []gateway.Attendee{{Email: "guest@example.com"}}
	c := newFake("c@example.com", event("e3", summary("Secret C")))
	s.state.Master = s.b.id
	if got := s.sync(t, []gateway.Calendar{s.a, s.b, c}, Options{}).Mirrors; got != 6 {
		t.Fatalf("mirrors %d", got)
	}
	d := s.b.written(MirrorID(s.a.id, "e1", s.b.id))
	if d.Summary != "Secret A" || *d.Location != "Office" || d.Visibility != "default" ||
		*d.Description != "Private\n\nGoogle Meet: https://meet.google.com/x\n\n元のカレンダー: a@example.com" {
		t.Fatalf("details %+v", d)
	}
	if _, ok := BodyMap(*d)["attendees"]; ok {
		t.Fatal("attendees copied")
	}
	if s.b.written(MirrorID(c.id, "e3", s.b.id)).Summary != "Secret C" {
		t.Fatal("c not detailed")
	}
	for _, cal := range []*fakeCalendar{s.a, c} {
		for _, w := range cal.writes {
			if w.body.Summary != "予定あり" || w.body.Visibility != "private" || w.body.Description != nil {
				t.Fatalf("non-master got details: %+v", w.body)
			}
		}
	}
}

func TestPrivateSourceStaysPrivateOnMaster(t *testing.T) {
	s := setup()
	c := newFake("c@example.com", event("e3", summary("Family")))
	s.state.Master = s.b.id
	s.sync(t, []gateway.Calendar{s.a, s.b, c}, Options{PrivateSources: map[string]bool{c.id: true}})
	family := s.b.written(MirrorID(c.id, "e3", s.b.id))
	if family.Summary != "Family" || family.Visibility != "private" {
		t.Fatalf("family %+v", family)
	}
	if s.b.written(MirrorID(s.a.id, "e1", s.b.id)).Visibility != "default" {
		t.Fatal("a should be default")
	}
}

func TestFreeOnlyToMaster(t *testing.T) {
	s := setup()
	s.a.items = append(s.a.items, event("free", summary("Lunch"), func(e *gateway.Event) { e.Transparency = "transparent" }))
	c := newFake("c@example.com")
	s.state.Master = s.b.id
	s.sync(t, []gateway.Calendar{s.a, s.b, c}, Options{})
	free := s.b.written(MirrorID(s.a.id, "free", s.b.id))
	if free.Transparency != "transparent" || free.Summary != "Lunch" {
		t.Fatalf("free %+v", free)
	}
	if c.written(MirrorID(s.a.id, "free", c.id)) != nil {
		t.Fatal("free should not reach c")
	}
}

func TestMasterFreeBecomesSlot(t *testing.T) {
	s := setup()
	s.b.items = append(s.b.items, event("slot", summary("Focus"), func(e *gateway.Event) { e.Transparency = "transparent" }))
	s.state.Master = s.b.id
	s.sync(t, nil, Options{})
	slot := s.a.written(MirrorID(s.b.id, "slot", s.a.id))
	if slot.Summary != "予定あり（MTG可能）" || slot.Transparency != "transparent" || slot.Visibility != "private" || slot.Description != nil {
		t.Fatalf("slot %+v", slot)
	}
}

func TestAllDayAndWorkingLocationFreeAreNotSlots(t *testing.T) {
	s := setup()
	s.b.items = append(s.b.items,
		event("holiday", func(e *gateway.Event) {
			e.Start, e.End, e.Transparency = date("2026-10-02"), date("2026-10-03"), "transparent"
		}),
		event("office", func(e *gateway.Event) { e.Transparency, e.EventType = "transparent", "workingLocation" }),
	)
	s.state.Master = s.b.id
	s.sync(t, nil, Options{})
	if len(s.a.writes) != 1 {
		t.Fatalf("writes %d", len(s.a.writes))
	}
}

func TestChangingMasterRewrites(t *testing.T) {
	s := setup()
	s.sync(t, nil, Options{})
	s.state.Master = s.a.id
	s.sync(t, nil, Options{})
	if len(s.a.writes) != 2 || s.a.writes[1].body.Summary != "Secret B" || len(s.b.writes) != 1 {
		t.Fatalf("a %d b %d", len(s.a.writes), len(s.b.writes))
	}
}

// ここから calendar-busy-sync からの改善点

func TestUnreadableAccountKeepsMirrors(t *testing.T) {
	s := setup()
	c := newFake("c@example.com", event("e3"))
	cals := []gateway.Calendar{s.a, s.b, c}
	s.sync(t, cals, Options{})
	before := copyMirrors(s.state.Mirrors)
	c.failList = true
	res := s.sync(t, cals, Options{})
	if len(s.a.deletes)+len(s.b.deletes)+len(c.deletes) != 0 || !reflect.DeepEqual(s.state.Mirrors, before) {
		t.Fatal("mirrors touched")
	}
	if len(res.Errors) != 1 || res.Errors[0].CalendarID != c.id {
		t.Fatalf("errors %v", res.Errors)
	}
}

func TestUnavailableAccountKeepsMirrors(t *testing.T) {
	s := setup()
	c := newFake("c@example.com", event("e3"))
	s.sync(t, []gateway.Calendar{s.a, s.b, c}, Options{})
	before := copyMirrors(s.state.Mirrors)
	s.sync(t, nil, Options{Unavailable: []string{c.id}})
	if len(s.a.deletes) != 0 || !reflect.DeepEqual(s.state.Mirrors, before) {
		t.Fatal("mirrors touched")
	}
}

func TestFailedWriteRetried(t *testing.T) {
	s := setup()
	s.b.failWrite = true
	first := s.sync(t, nil, Options{})
	if len(first.Errors) != 1 || len(s.state.Mirrors) != 1 {
		t.Fatalf("errors %v mirrors %d", first.Errors, len(s.state.Mirrors))
	}
	s.b.failWrite = false
	s.sync(t, nil, Options{})
	if len(s.b.writes) != 1 || len(s.state.Mirrors) != 2 {
		t.Fatalf("writes %d mirrors %d", len(s.b.writes), len(s.state.Mirrors))
	}
}

func TestDeadlineDefers(t *testing.T) {
	s := setup()
	first := s.sync(t, nil, Options{Deadline: time.Unix(0, 0)})
	if first.Pending != 2 || len(s.a.writes)+len(s.b.writes) != 0 || len(s.state.Mirrors) != 0 {
		t.Fatalf("pending %d", first.Pending)
	}
	if second := s.sync(t, nil, Options{}); second.Writes != 2 {
		t.Fatalf("writes %d", second.Writes)
	}
}

func TestDisconnect(t *testing.T) {
	s := setup()
	c := newFake("c@example.com")
	s.sync(t, []gateway.Calendar{s.a, s.b, c}, Options{})
	out := RemoveMirrorsIn(context.Background(), s.b, s.state.Mirrors)
	if out.Deleted != 1 || out.Failed != 0 || !reflect.DeepEqual(s.b.deletes, []string{MirrorID(s.a.id, "e1", s.b.id)}) {
		t.Fatalf("out %+v deletes %v", out, s.b.deletes)
	}
	for k := range out.Remaining {
		if _, _, target, _ := ParseKey(k); target == s.b.id {
			t.Fatal("b still a target")
		}
	}
	// b の予定から a・c に作った同期予定は、b を外した次の同期で消える
	s.state.Mirrors = out.Remaining
	s.sync(t, []gateway.Calendar{s.a, c}, Options{})
	if !reflect.DeepEqual(s.a.deletes, []string{MirrorID(s.b.id, "e2", s.a.id)}) || !reflect.DeepEqual(c.deletes, []string{MirrorID(s.b.id, "e2", c.id)}) {
		t.Fatalf("a %v c %v", s.a.deletes, c.deletes)
	}
	for k := range s.state.Mirrors {
		if src, _, tgt, _ := ParseKey(k); src == s.b.id || tgt == s.b.id {
			t.Fatal("b remains")
		}
	}
}

func TestNewFlag(t *testing.T) {
	s := setup()
	s.sync(t, nil, Options{})
	s.a.items[0].Summary = "changed"
	s.b.items[0].End = dt("2026-10-02T12:00:00+09:00")
	s.sync(t, nil, Options{})
	// a の予定のタイトル変更は「予定あり」の本文を変えない
	if !reflect.DeepEqual(s.b.newFlags, []bool{true}) || !reflect.DeepEqual(s.a.newFlags, []bool{true, false}) {
		t.Fatalf("b %v a %v", s.b.newFlags, s.a.newFlags)
	}
}

func TestConcurrentWrites(t *testing.T) {
	var cals []gateway.Calendar
	var fakes []*fakeCalendar
	for i := range 5 {
		f := newFake(fmt.Sprintf("c%d@example.com", i), event(fmt.Sprintf("e%d", i)), event(fmt.Sprintf("f%d", i)))
		cals, fakes = append(cals, f), append(fakes, f)
	}
	state := &State{Mirrors: Mirrors{}}
	res, err := Reconcile(context.Background(), cals, state, Options{Now: time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC), Concurrency: 8})
	if err != nil || res.Writes != 5*2*4 || len(state.Mirrors) != 40 {
		t.Fatalf("res %+v err %v", res, err)
	}
	for _, f := range fakes {
		if len(f.writes) != 8 {
			t.Fatalf("writes %d", len(f.writes))
		}
	}
}

func TestTooFewAccounts(t *testing.T) {
	s := setup()
	_, err := Reconcile(context.Background(), []gateway.Calendar{s.a}, s.state, Options{})
	if !errors.Is(err, ErrTooFewAccounts) {
		t.Fatal(err)
	}
}

func copyMirrors(m Mirrors) Mirrors {
	out := Mirrors{}
	for k, v := range m {
		out[k] = v
	}
	return out
}

func TestColorsAreSameAcrossTargets(t *testing.T) {
	s := setup()
	c := newFake("c@example.com", event("e3"))
	s.state.Master = s.b.id
	colors := map[string]string{s.a.id: "9", s.b.id: "6"} // c は色なし
	s.sync(t, []gateway.Calendar{s.a, s.b, c}, Options{Colors: colors})
	// a の予定は、b（マスター・中身あり）にも c（予定ありだけ）にも同じ色で書かれる
	if got := s.b.written(MirrorID(s.a.id, "e1", s.b.id)).ColorID; got != "9" {
		t.Fatalf("a→b color %q", got)
	}
	if got := c.written(MirrorID(s.a.id, "e1", c.id)).ColorID; got != "9" {
		t.Fatalf("a→c color %q", got)
	}
	if got := s.a.written(MirrorID(s.b.id, "e2", s.a.id)).ColorID; got != "6" {
		t.Fatalf("b→a color %q", got)
	}
	// 色のないアカウントの同期予定には colorId を送らない（旧実装と同じ本文）
	body := s.a.written(MirrorID(c.id, "e3", s.a.id))
	if _, ok := BodyMap(*body)["colorId"]; ok {
		t.Fatal("colorId should be absent")
	}
	// 色を変えると、その元アカウントの同期予定だけが書き直される
	before := len(s.a.writes) + len(s.b.writes) + len(c.writes)
	colors[s.a.id] = "11"
	s.sync(t, []gateway.Calendar{s.a, s.b, c}, Options{Colors: colors})
	if after := len(s.a.writes) + len(s.b.writes) + len(c.writes); after-before != 2 {
		t.Fatalf("rewrites %d, want 2 (a→b, a→c)", after-before)
	}
}

func TestNextColor(t *testing.T) {
	if got := NextColor(nil); got != ColorOrder[0] {
		t.Fatal(got)
	}
	if got := NextColor([]string{"9", "6"}); got != "10" {
		t.Fatal(got)
	}
	// 11 色を使い切ったら、使われている数が一番少ない色
	used := append([]string{}, ColorOrder...)
	used = append(used, "9", "6")
	if got := NextColor(used); got != "10" {
		t.Fatal(got)
	}
	if ValidColor("12") || ValidColor("") || !ValidColor("11") {
		t.Fatal("ValidColor")
	}
}
