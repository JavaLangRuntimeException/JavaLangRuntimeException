package usecase

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/reservation/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/reservation/domain/service"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/errs"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/jst"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/observability"
)

type fakeCalendar struct {
	name      string
	created   []gateway.Event
	deleteErr error
	deletes   int
}

func (f *fakeCalendar) Name() string { return f.name }
func (f *fakeCalendar) Create(_ context.Context, e gateway.Event) (*gateway.Created, error) {
	f.created = append(f.created, e)
	return &gateway.Created{EventID: "ev1"}, nil
}
func (f *fakeCalendar) Get(context.Context, string) (*gateway.Created, error) {
	return &gateway.Created{EventID: "ev1"}, nil
}
func (f *fakeCalendar) Delete(context.Context, string) (bool, error) {
	f.deletes++
	return f.deleteErr == nil, f.deleteErr
}

type fakeLocations map[string]string

func (f fakeLocations) Get(_ context.Context, date string) (string, error) {
	if v, ok := f["error"]; ok {
		return "", errors.New(v)
	}
	return f[date], nil
}

type fakeIcal map[string]string

func (f fakeIcal) Fetch(_ context.Context, url string) gateway.Fetched {
	if body, ok := f[url]; ok {
		return gateway.Fetched{OK: true, Status: 200, Body: body}
	}
	return gateway.Fetched{Status: 404}
}

var now = time.Date(2026, 10, 6, 10, 0, 0, 0, jst.Location)

func newUC(primary, fallback gateway.Calendar, wl gateway.WorkLocations) *ReservationUsecaseImpl {
	return NewReservationUsecase(Config{Primary: primary, Fallback: fallback, Ical: service.NewIcsParser(540),
		Clock:   func() time.Time { return now },
		Sources: []gateway.IcalSource{{URL: "https://cal.example.com/secret-token/basic.ics", Name: "A"}, {URL: "https://down.example.com/x.ics", Name: "B"}},
	}, wl, fakeIcal{"https://cal.example.com/secret-token/basic.ics": "BEGIN:VEVENT\nDTSTART:20261006T010000Z\nDTEND:20261006T020000Z\nSUMMARY:x\nEND:VEVENT\n"},
		nil, observability.Noop{})
}

func input(day int32) CreateReservationInput {
	return CreateReservationInput{Year: 2026, Month: 10, Day: day, Start: &ClockTime{Hour: 10}, End: &ClockTime{Hour: 11},
		Name: "山田", Email: "a@example.com", Purpose: "STECH", ContactMethod: "meet"}
}

func code(err error) string {
	if de, ok := errs.As(err); ok {
		return de.Code
	}
	return ""
}

func TestCreateUsesWebhookTexts(t *testing.T) {
	cal := &fakeCalendar{name: "gas_webhook"}
	out, err := newUC(cal, nil, fakeLocations{}).CreateReservation(context.Background(), input(7))
	if err != nil || out.EventID != "ev1" {
		t.Fatalf("out=%+v err=%v", out, err)
	}
	e := cal.created[0]
	if e.Summary != "STECHご相談_山田様x棚橋(taramanji)" || !e.CreateMeet || e.Attendees[0] != "a@example.com" {
		t.Fatalf("event %+v", e)
	}
	if got := e.Start.UTC().Format(time.RFC3339); got != "2026-10-07T01:00:00Z" {
		t.Fatalf("start %s", got)
	}
}

func TestCreateRejectsUnavailableDay(t *testing.T) {
	cal := &fakeCalendar{name: "gas_webhook"}
	_, err := newUC(cal, nil, fakeLocations{"2026-10-07": service.UnavailableLocation}).CreateReservation(context.Background(), input(7))
	if code(err) != "location_unavailable" || len(cal.created) != 0 {
		t.Fatalf("err=%v created=%d", err, len(cal.created))
	}
	// 勤務場所を読めなくても予約は止めない
	if _, err := newUC(cal, nil, fakeLocations{"error": "down"}).CreateReservation(context.Background(), input(7)); err != nil {
		t.Fatal(err)
	}
}

func TestCreateValidation(t *testing.T) {
	uc := newUC(&fakeCalendar{name: "gas_webhook"}, nil, fakeLocations{})
	bad := input(7)
	bad.Email = "not-an-email"
	if code := code(must(uc.CreateReservation(context.Background(), bad))); code != "invalid_email" {
		t.Fatalf("code %s", code)
	}
	if code := code(must(newUC(nil, nil, fakeLocations{}).CreateReservation(context.Background(), input(7)))); code != "no_token" {
		t.Fatalf("code %s", code)
	}
}

func must[T any](_ T, err error) error { return err }

func TestCancelFallsBackToWebhook(t *testing.T) {
	google := &fakeCalendar{name: "google_calendar", deleteErr: errs.NewUpstreamError("google_delete_failed", "", "")}
	hook := &fakeCalendar{name: "gas_webhook"}
	out, err := newUC(google, hook, fakeLocations{}).CancelReservation(context.Background(), CancelReservationInput{EventID: " ev1 "})
	if err != nil || !out.Deleted || google.deletes != 1 || hook.deletes != 1 {
		t.Fatalf("out=%+v err=%v", out, err)
	}
	if _, err := newUC(google, nil, fakeLocations{}).CancelReservation(context.Background(), CancelReservationInput{}); code(err) != "missing_event_id" {
		t.Fatalf("err %v", err)
	}
}

func TestBusyAndSources(t *testing.T) {
	uc := newUC(nil, nil, fakeLocations{})
	busy, err := uc.GetBusy(context.Background(), GetBusyInput{Debug: true})
	if err != nil || len(busy.Busy) != 1 || busy.Busy[0].Start != "2026-10-06T00:30:00.000Z" || busy.Busy[0].End != "2026-10-06T02:30:00.000Z" {
		t.Fatalf("busy %+v %v", busy, err)
	}
	if busy.Sources[0].URL != "https://cal.example.com/***" || busy.Sources[1].Ok {
		t.Fatalf("sources %+v %+v", busy.Sources[0], busy.Sources[1])
	}
	list, _ := uc.ListIcalSources(context.Background(), ListIcalSourcesInput{})
	if len(list.Events) != 1 || list.Events[0].Source != "A" || list.Sources[0].EventCount != 1 || list.WeekStart != "2026-10-04T15:00:00.000Z" {
		t.Fatalf("list %+v", list)
	}
}

func TestResolveMapsRejectsOtherHosts(t *testing.T) {
	out, err := newUC(nil, nil, fakeLocations{}).ResolveMapsUrl(context.Background(), ResolveMapsUrlInput{URL: "http://169.254.169.254/"})
	if err != nil || out.Name != "" || out.Error != "unsupported_url" {
		t.Fatalf("out %+v %v", out, err)
	}
}

func TestReserveResearchIsClosed(t *testing.T) {
	err := newUC(nil, nil, fakeLocations{}).ReserveResearch(context.Background(), ReserveResearchInput{})
	if de, _ := errs.As(err); de == nil || de.Code != "capacity_reached" || de.Type != errs.ErrorTypeForbidden {
		t.Fatalf("err %v", err)
	}
}
