package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/calendarsync/domain/gateway"
)

// fakeTaskCalendar は Google ToDo も読めるカレンダー
type fakeTaskCalendar struct {
	*fakeCalendar
	todos    []gateway.Task
	tasksErr error
}

func (f *fakeTaskCalendar) Tasks(context.Context, time.Time, time.Time) ([]gateway.Task, error) {
	return f.todos, f.tasksErr
}

type taskEnv struct {
	*env
	c *fakeTaskCalendar
}

// a がマスター、b と c は ToDo を持つ（マスターの a も ToDo を持つが、出さない）
func setupTasks() *taskEnv {
	s := setup()
	s.a.items, s.b.items = nil, nil
	s.state.Master = s.a.id
	return &taskEnv{env: s, c: &fakeTaskCalendar{fakeCalendar: newFake("c@example.com"),
		todos: []gateway.Task{{ID: "t1", Title: "請求書を出す", Notes: "経理へ", Due: "2026-10-03", WebViewLink: "https://tasks.google.com/task/t1"}}}}
}

func (s *taskEnv) cals() []gateway.Calendar {
	a := &fakeTaskCalendar{fakeCalendar: s.a, todos: []gateway.Task{{ID: "own", Title: "自分の ToDo", Due: "2026-10-03"}}}
	b := &fakeTaskCalendar{fakeCalendar: s.b}
	return []gateway.Calendar{a, b, s.c}
}

func TestTasksMirrorOnlyToMaster(t *testing.T) {
	s := setupTasks()
	res := s.sync(t, s.cals(), Options{Colors: map[string]string{s.c.id: "5"}})
	if res.SourceTasks != 1 || res.Mirrors != 1 || len(s.b.writes) != 0 || len(s.c.writes) != 0 || len(s.a.writes) != 1 {
		t.Fatalf("res %+v writes a=%d b=%d c=%d", res, len(s.a.writes), len(s.b.writes), len(s.c.writes))
	}
	w := s.a.writes[0]
	desc := "経理へ\n\nGoogle ToDo: https://tasks.google.com/task/t1\n\n元のアカウント: c@example.com"
	if w.id != MirrorID(s.c.id, "task:t1", s.a.id) || w.body.Summary != "請求書を出す" || w.body.Transparency != "transparent" ||
		w.body.Visibility != "default" || w.body.Start.Date() != "2026-10-03" || w.body.End.Date() != "2026-10-04" ||
		w.body.ColorID != "5" || w.body.Marker[Marker] != "c@example.com:task:t1" || w.body.Description == nil || *w.body.Description != desc {
		t.Fatalf("body %+v", w)
	}
	// 変わらなければ書かない。完了（一覧から消える）したら消す
	s.sync(t, s.cals(), Options{Colors: map[string]string{s.c.id: "5"}})
	if len(s.a.writes) != 1 {
		t.Fatal("not idempotent")
	}
	s.c.todos = nil
	if res := s.sync(t, s.cals(), Options{}); res.Deletes != 1 || res.Mirrors != 0 || s.a.deletes[0] != w.id {
		t.Fatalf("res %+v deletes %v", res, s.a.deletes)
	}
}

func TestTasksNoMasterOrPrivate(t *testing.T) {
	s := setupTasks()
	s.state.Master = ""
	if res := s.sync(t, s.cals(), Options{}); res.Mirrors != 0 || len(s.a.writes)+len(s.b.writes) != 0 {
		t.Fatalf("no master: %+v", res)
	}
	s.state.Master = s.a.id
	s.c.todos[0].Title = ""
	s.sync(t, s.cals(), Options{PrivateSources: map[string]bool{s.c.id: true}})
	if b := s.a.writes[0].body; b.Summary != "(タイトルなし)" || b.Visibility != "private" {
		t.Fatalf("body %+v", b)
	}
}

func TestTasksUnreadableKeepMirrors(t *testing.T) {
	s := setupTasks()
	s.sync(t, s.cals(), Options{})
	// 許可がない（つなぎ直す前）ならエラーにせず、作った分は残す
	s.c.todos, s.c.tasksErr = nil, gateway.ErrTasksNotGranted
	res := s.sync(t, s.cals(), Options{})
	if len(res.Errors) != 0 || res.Mirrors != 1 || len(s.a.deletes) != 0 {
		t.Fatalf("not granted: %+v", res)
	}
	// それ以外の失敗はエラーに出し、やはり残す
	s.c.tasksErr = errors.New("Google API HTTP 500: ")
	res = s.sync(t, s.cals(), Options{})
	if len(res.Errors) != 1 || res.Errors[0].CalendarID != s.c.id || res.Mirrors != 1 || len(s.a.deletes) != 0 {
		t.Fatalf("failed: %+v", res)
	}
}
