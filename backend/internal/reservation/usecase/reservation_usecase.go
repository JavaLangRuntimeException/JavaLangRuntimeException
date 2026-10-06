package usecase

import (
	"context"
	"log/slog"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/reservation/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/reservation/domain/service"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/errs"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/observability"
)

// emailPattern は予約フォームと同じ形式チェック
var emailPattern = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)

// Config は予約の書き込み先などの設定
type Config struct {
	// Primary は優先する書き込み先（Google Calendar API が使えればそれ、なければ GAS ウェブフック）
	Primary gateway.Calendar
	// Fallback は Primary が Google Calendar API のとき、削除に失敗したら使う GAS ウェブフック（任意）
	Fallback    gateway.Calendar
	Sources     []gateway.IcalSource
	Ical        service.IcsParser
	Clock       func() time.Time
	CallTimeout time.Duration
}

type ReservationUsecaseImpl struct {
	cfg       Config
	locations gateway.WorkLocations
	fetcher   gateway.IcalFetcher
	maps      gateway.MapsFetcher
	metrics   observability.Metrics
}

var _ ReservationUsecase = (*ReservationUsecaseImpl)(nil)

func NewReservationUsecase(cfg Config, wl gateway.WorkLocations, f gateway.IcalFetcher, m gateway.MapsFetcher, metrics observability.Metrics) *ReservationUsecaseImpl {
	if cfg.Clock == nil {
		cfg.Clock = time.Now
	}
	return &ReservationUsecaseImpl{cfg: cfg, locations: wl, fetcher: f, maps: m, metrics: metrics}
}

func toRequest(in CreateReservationInput) service.Request {
	r := service.Request{
		Year: int(in.Year), Month: int(in.Month), Day: int(in.Day),
		Name: in.Name, Email: strings.TrimSpace(in.Email), Purpose: in.Purpose, ContactMethod: in.ContactMethod,
		DiscordName: in.DiscordName, DiscordServer: in.DiscordServer, SlackName: in.SlackName, SlackWorkspace: in.SlackWorkspace,
		OtherNote: in.OtherNote, OfflinePlaceLink: in.OfflinePlaceLink, OfflinePlaceName: in.OfflinePlaceName,
		OfflinePlaceDetail: in.OfflinePlaceDetail, MeetingNote: in.MeetingNote, Location: in.Location,
	}
	if in.Start != nil {
		r.Start = &service.ClockTime{Hour: int(in.Start.Hour), Minute: int(in.Start.Minute)}
	}
	if in.End != nil {
		r.End = &service.ClockTime{Hour: int(in.End.Hour), Minute: int(in.End.Minute)}
	}
	return r
}

func (u *ReservationUsecaseImpl) noCalendar() error {
	return errs.NewCodedError(errs.ErrorTypeUnauthorized, "no_token", "予約の書き込み先が設定されていません")
}

func (u *ReservationUsecaseImpl) CreateReservation(ctx context.Context, in CreateReservationInput) (*CreateReservationOutput, error) {
	r := toRequest(in)
	if err := service.CheckTimes(r); err != nil {
		return nil, err
	}
	// ブラウザ側と同じ検証をサーバーでも行う（旧 API は検証していなかった）
	if r.Email != "" && !emailPattern.MatchString(r.Email) {
		return nil, errs.NewValidationError("email", "メールアドレスの形式が正しくありません").WithCode("invalid_email")
	}
	if !r.EndAt().After(r.StartAt()) {
		return nil, errs.NewCodedError(errs.ErrorTypeBadRequest, "invalid_end_time", "終了時刻は開始時刻より後にしてください")
	}
	location, err := u.locations.Get(ctx, r.DateKey())
	if err != nil {
		// 旧 API と同じく、勤務場所を読めなくても予約は止めない
		slog.WarnContext(ctx, "work location lookup failed", "date", r.DateKey(), "error", err)
	}
	if err := service.CheckWindow(r, u.cfg.Clock(), location); err != nil {
		u.count(ctx, "reservation.rejected", "reason:"+codeOf(err))
		return nil, err
	}
	cal := u.cfg.Primary
	if cal == nil {
		return nil, u.noCalendar()
	}

	event := gateway.Event{
		Location: r.Location, Start: r.StartAt(), End: r.EndAt(),
		CreateMeet: r.WantsMeet(), ContactMethod: r.ContactMethod,
	}
	if r.Email != "" {
		event.Attendees = []string{r.Email}
	}
	if cal.Name() == "gas_webhook" {
		event.Summary = service.WebhookSummary(r.Purpose, r.Name)
		event.Description = service.Description(r, false)
	} else {
		event.Summary = service.CalendarSummary(r.Purpose, r.Name)
		event.Description = service.Description(r, true)
	}

	started := u.cfg.Clock()
	created, err := cal.Create(ctx, event)
	u.timing(ctx, "reservation.calendar.latency", u.cfg.Clock().Sub(started), "via:"+cal.Name(), "op:create", "status:"+status(err))
	if err != nil {
		u.count(ctx, "reservation.created", "status:failed", "via:"+cal.Name(), "reason:"+codeOf(err))
		return nil, err
	}
	u.count(ctx, "reservation.created", "status:ok", "via:"+cal.Name(), "purpose:"+tagValue(r.Purpose), "contact:"+tagValue(strings.ToLower(r.ContactMethod)))
	return &CreateReservationOutput{EventID: created.EventID, HtmlLink: created.HTMLLink, MeetLink: created.MeetLink,
		Invited: created.Invited, Note: created.Note}, nil
}

func (u *ReservationUsecaseImpl) GetReservation(ctx context.Context, in GetReservationInput) (*GetReservationOutput, error) {
	id := strings.TrimSpace(in.EventID)
	if id == "" {
		return nil, errs.NewCodedError(errs.ErrorTypeBadRequest, "missing_event_id", "EventIDを入力してください")
	}
	if u.cfg.Primary == nil {
		return nil, u.noCalendar()
	}
	got, err := u.cfg.Primary.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	return &GetReservationOutput{EventID: got.EventID, HtmlLink: got.HTMLLink, MeetLink: got.MeetLink}, nil
}

func (u *ReservationUsecaseImpl) CancelReservation(ctx context.Context, in CancelReservationInput) (*CancelReservationOutput, error) {
	id := strings.TrimSpace(in.EventID)
	if id == "" {
		return nil, errs.NewCodedError(errs.ErrorTypeBadRequest, "missing_event_id", "EventIDを入力してください")
	}
	cal := u.cfg.Primary
	if cal == nil {
		return nil, u.noCalendar()
	}
	deleted, err := cal.Delete(ctx, id)
	if err != nil && u.cfg.Fallback != nil {
		slog.WarnContext(ctx, "calendar delete failed; trying webhook", "via", cal.Name(), "error", err)
		cal = u.cfg.Fallback
		deleted, err = cal.Delete(ctx, id)
	}
	if err != nil {
		u.count(ctx, "reservation.cancelled", "status:failed", "via:"+cal.Name(), "reason:"+codeOf(err))
		return nil, err
	}
	u.count(ctx, "reservation.cancelled", "status:ok", "via:"+cal.Name())
	return &CancelReservationOutput{Deleted: deleted}, nil
}

// fetchAll は iCal をすべて並行に取得する
func (u *ReservationUsecaseImpl) fetchAll(ctx context.Context) []gateway.Fetched {
	results := make([]gateway.Fetched, len(u.cfg.Sources))
	var wg sync.WaitGroup
	for i, s := range u.cfg.Sources {
		wg.Add(1)
		go func() {
			defer wg.Done()
			started := u.cfg.Clock()
			results[i] = u.fetcher.Fetch(ctx, s.URL)
			ok := "ok"
			if !results[i].OK {
				ok = "failed"
			}
			u.timing(ctx, "reservation.ical.latency", u.cfg.Clock().Sub(started), "source:"+tagValue(s.Name), "status:"+ok)
		}()
	}
	wg.Wait()
	return results
}

func (u *ReservationUsecaseImpl) GetBusy(ctx context.Context, in GetBusyInput) (*GetBusyOutput, error) {
	from := service.WeekStart(in.WeekStartIso, u.cfg.Clock())
	to := from.Add(7 * 24 * time.Hour)
	results := u.fetchAll(ctx)
	var events []service.Interval
	for _, r := range results {
		events = append(events, u.cfg.Ical.Events(r.Body, from, to)...)
	}
	buffer := service.BusyBuffer
	if in.NoBuffer {
		buffer = 0
	}
	out := &GetBusyOutput{Busy: []*Interval{}}
	for _, iv := range service.Busy(events, from, to, buffer) {
		out.Busy = append(out.Busy, &Interval{Start: service.FormatISO(iv.Start), End: service.FormatISO(iv.End)})
	}
	if in.Debug {
		out.SourceCount = int32(len(u.cfg.Sources))
		for i, s := range u.cfg.Sources {
			// 旧 API は debug で iCal の URL（秘密の鍵を含む）をそのまま返していたため伏せる
			out.Sources = append(out.Sources, &IcalSourceStatus{URL: MaskURL(s.URL), Name: s.Name, Ok: results[i].OK,
				Status: int32(results[i].Status), Length: int32(len(results[i].Body))})
		}
	}
	return out, nil
}

func (u *ReservationUsecaseImpl) ListIcalSources(ctx context.Context, in ListIcalSourcesInput) (*ListIcalSourcesOutput, error) {
	from := service.WeekStart(in.WeekStartIso, u.cfg.Clock())
	to := from.Add(7 * 24 * time.Hour)
	results := u.fetchAll(ctx)
	out := &ListIcalSourcesOutput{Sources: []*IcalSourceStatus{}, Events: []*IcalEvent{},
		WeekStart: service.FormatISO(from), WeekEnd: service.FormatISO(to)}
	type timed struct {
		start time.Time
		event *IcalEvent
	}
	var all []timed
	for i, s := range u.cfg.Sources {
		events := u.cfg.Ical.Events(results[i].Body, from, to)
		masked := MaskURL(s.URL)
		out.Sources = append(out.Sources, &IcalSourceStatus{URL: masked, Name: s.Name, Ok: results[i].OK,
			Status: int32(results[i].Status), Length: int32(len(results[i].Body)), EventCount: int32(len(events))})
		for _, e := range events {
			all = append(all, timed{e.Start, &IcalEvent{Start: service.FormatISO(e.Start), End: service.FormatISO(e.End),
				Summary: e.Summary, Source: s.Name, SourceURL: masked}})
		}
	}
	// 開始時刻順（同時刻はソースの順）
	sort.SliceStable(all, func(i, j int) bool { return all[i].start.Before(all[j].start) })
	for _, t := range all {
		out.Events = append(out.Events, t.event)
	}
	return out, nil
}

// MaskURL は iCal の URL をホスト名までにする（秘密の鍵を含むため）
func MaskURL(raw string) string {
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return "***"
	}
	return u.Scheme + "://" + u.Host + "/***"
}

func (u *ReservationUsecaseImpl) ResolveMapsUrl(ctx context.Context, in ResolveMapsUrlInput) (*ResolveMapsUrlOutput, error) {
	raw := strings.TrimSpace(in.URL)
	if raw == "" {
		return nil, errs.NewValidationError("url", "url is required").WithCode("missing_url")
	}
	raw = service.NormalizeMapsInput(raw)
	parsed, err := url.Parse(raw)
	if err != nil || !service.IsMapsURL(parsed) {
		// Google マップ以外は取りに行かない（場所名は空のまま。利用者が手で入力できる）
		return &ResolveMapsUrlOutput{FinalURL: raw, Error: "unsupported_url"}, nil
	}
	page, err := u.maps.Fetch(ctx, raw)
	if err != nil {
		slog.WarnContext(ctx, "maps resolve failed", "error", err)
		u.count(ctx, "reservation.maps_resolve", "status:failed")
		return &ResolveMapsUrlOutput{FinalURL: raw, Error: "failed to resolve"}, nil
	}
	name := service.PlaceNameFromURL(page.FinalURL)
	if name == "" {
		name = service.PlaceNameFromHTML(page.HTML)
	}
	name = service.ValidPlaceName(name)
	u.count(ctx, "reservation.maps_resolve", "status:ok", "found:"+boolTag(name != ""))
	return &ResolveMapsUrlOutput{Name: name, FinalURL: page.FinalURL}, nil
}

// ReserveResearch は実験参加の受付。定員に達したため常に断る（旧 API と同じ）
func (u *ReservationUsecaseImpl) ReserveResearch(ctx context.Context, in ReserveResearchInput) error {
	return errs.NewCodedError(errs.ErrorTypeForbidden, "capacity_reached", "実験参加人数の定員に達しました。ご協力ありがとうございました！")
}

func codeOf(err error) string {
	if de, ok := errs.As(err); ok && de.Code != "" {
		return de.Code
	}
	return "internal"
}

func status(err error) string {
	if err != nil {
		return "failed"
	}
	return "ok"
}

func boolTag(b bool) string {
	if b {
		return "true"
	}
	return "false"
}

// tagValue は Datadog のタグ値に使えない文字を _ にする
func tagValue(s string) string {
	if s == "" {
		return "none"
	}
	return strings.Map(func(r rune) rune {
		if r == ',' || r == ' ' || r == '|' || r == '#' {
			return '_'
		}
		return r
	}, s)
}

func (u *ReservationUsecaseImpl) count(_ context.Context, name string, tags ...string) {
	u.metrics.Count(name, 1, tags...)
}

func (u *ReservationUsecaseImpl) timing(_ context.Context, name string, d time.Duration, tags ...string) {
	u.metrics.Timing(name, d, tags...)
}
