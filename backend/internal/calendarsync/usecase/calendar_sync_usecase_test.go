package usecase

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"

	"github.com/javalangruntimeexception/taramanji/backend/internal/calendarsync/domain/entity"
	"github.com/javalangruntimeexception/taramanji/backend/internal/calendarsync/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/calendarsync/domain/service"
	infragw "github.com/javalangruntimeexception/taramanji/backend/internal/calendarsync/infra/gateway"
	infrarepo "github.com/javalangruntimeexception/taramanji/backend/internal/calendarsync/infra/repository"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/errs"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/observability"
)

type fakeCal struct {
	mu      sync.Mutex
	id      string
	events  []gateway.Event
	writes  int
	deletes int
}

func (f *fakeCal) ID() string { return f.id }
func (f *fakeCal) Events(context.Context, time.Time, time.Time) ([]gateway.Event, error) {
	return f.events, nil
}
func (f *fakeCal) Upsert(context.Context, string, gateway.MirrorBody, bool) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.writes++
	return nil
}
func (f *fakeCal) Delete(context.Context, string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.deletes++
	return nil
}

// fakeConnector は更新トークン "revoked" のアカウントを失効扱いにする
type fakeConnector map[string]*fakeCal

func (c fakeConnector) Connect(_ context.Context, id, token string) (gateway.Calendar, error) {
	if token == "revoked" {
		return nil, errors.New(`oauth2: "invalid_grant"`)
	}
	return c[id], nil
}

type fakeOAuth struct{ email string }

func (o fakeOAuth) AuthURL(state, challenge, hint string) string {
	return "https://accounts.google.com/o/oauth2/v2/auth?state=" + state + "&code_challenge=" + challenge + "&login_hint=" + hint
}
func (o fakeOAuth) Exchange(_ context.Context, code, verifier string) (string, string, error) {
	return "refresh-" + code, o.email, nil
}

type recorder struct {
	observability.Noop
	mu     sync.Mutex
	counts []string
}

func (r *recorder) Count(name string, _ int64, tags ...string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.counts = append(r.counts, name+"|"+strings.Join(tags, ","))
}

type fixture struct {
	uc      *CalendarSyncUsecaseImpl
	rdb     redis.UniversalClient
	cals    fakeConnector
	cipher  gateway.Cipher
	metrics *recorder
}

func ev(id string) gateway.Event {
	return gateway.Event{ID: id, Status: "confirmed", Start: gateway.EventTime{"dateTime": "2026-10-07T10:00:00+09:00"},
		End: gateway.EventTime{"dateTime": "2026-10-07T11:00:00+09:00"}}
}

func setup(t *testing.T) *fixture {
	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	cipher, err := infragw.NewCipher("MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=")
	if err != nil {
		t.Fatal(err)
	}
	cals := fakeConnector{
		"a@example.com": {id: "a@example.com", events: []gateway.Event{ev("e1")}},
		"b@example.com": {id: "b@example.com", events: []gateway.Event{ev("e2")}},
		"c@example.com": {id: "c@example.com"},
	}
	m := &recorder{}
	now := time.Date(2026, 10, 6, 0, 0, 0, 0, time.UTC)
	uc := NewCalendarSyncUsecase(Deps{
		Accounts: infrarepo.NewRedisCalendarAccountRepository(rdb), Settings: infrarepo.NewRedisSyncSettingRepository(rdb),
		Mirrors: infrarepo.NewRedisSyncMirrorRepository(rdb), Connector: cals, OAuth: fakeOAuth{email: "a@example.com"},
		Cipher: cipher, State: infragw.NewRunState(rdb), Metrics: m, Clock: func() time.Time { return now },
	})
	return &fixture{uc: uc, rdb: rdb, cals: cals, cipher: cipher, metrics: m}
}

func (f *fixture) connect(t *testing.T, id, token string, private bool, at time.Time) {
	sealed, _ := f.cipher.Encrypt(token)
	if err := f.uc.d.Accounts.Upsert(context.Background(), &entity.CalendarAccount{CalendarID: id, RefreshToken: sealed, Private: private, ConnectedAt: at}); err != nil {
		t.Fatal(err)
	}
}

func code(err error) string {
	if de, ok := errs.As(err); ok {
		return de.Code
	}
	return ""
}

func TestRunSyncPersistsMirrors(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	t0 := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	f.connect(t, "a@example.com", "ta", false, t0)
	f.connect(t, "b@example.com", "tb", false, t0.Add(time.Hour))

	out, err := f.uc.RunSync(ctx, RunSyncInput{})
	if err != nil || out.Run.Writes != 2 || out.Run.Mirrors != 2 {
		t.Fatalf("out %+v err %v", out, err)
	}
	mirrors, _ := f.uc.d.Mirrors.SelectAll(ctx)
	if len(mirrors) != 2 {
		t.Fatalf("stored %d", len(mirrors))
	}
	// 2 回目は何も書かない（記録が Redis から読めている）
	out, _ = f.uc.RunSync(ctx, RunSyncInput{})
	if out.Run.Writes != 0 || f.cals["a@example.com"].writes != 1 {
		t.Fatalf("second run wrote %d", out.Run.Writes)
	}
	// 予定が消えたら同期予定と記録も消える
	f.cals["a@example.com"].events = nil
	out, _ = f.uc.RunSync(ctx, RunSyncInput{})
	mirrors, _ = f.uc.d.Mirrors.SelectAll(ctx)
	if out.Run.Deletes != 1 || len(mirrors) != 1 {
		t.Fatalf("deletes %d stored %d", out.Run.Deletes, len(mirrors))
	}
	status, err := f.uc.GetStatus(ctx, GetStatusInput{})
	if err != nil || len(status.Accounts) != 2 || status.Accounts[0].CalendarID != "a@example.com" || status.LastRun.Deletes != 1 {
		t.Fatalf("status %+v %v", status, err)
	}
	if !strings.Contains(strings.Join(f.metrics.counts, " "), "calendar_sync.run|status:ok") {
		t.Fatalf("metrics %v", f.metrics.counts)
	}
}

func TestRunSyncIdleAndReconnect(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	out, _ := f.uc.RunSync(ctx, RunSyncInput{})
	if len(out.Run.Errors) != 1 || out.Run.Errors[0].Error != idleMessage {
		t.Fatalf("idle %+v", out.Run)
	}
	f.connect(t, "a@example.com", "ta", false, time.Now())
	f.connect(t, "b@example.com", "revoked", false, time.Now())
	out, err := f.uc.RunSync(ctx, RunSyncInput{})
	if err != nil || len(out.Run.Reconnect) != 1 || out.Run.Reconnect[0] != "b@example.com" || out.Run.Writes != 0 {
		t.Fatalf("out %+v err %v", out.Run, err)
	}
}

func TestLocked(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	unlock, err := f.uc.d.State.Lock(ctx, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.uc.RunSync(ctx, RunSyncInput{}); code(err) != "sync_locked" {
		t.Fatalf("err %v", err)
	}
	if _, err := f.uc.Disconnect(ctx, DisconnectInput{CalendarID: "a@example.com"}); code(err) != "sync_locked" {
		t.Fatalf("err %v", err)
	}
	unlock()
	if _, err := f.uc.RunSync(ctx, RunSyncInput{}); err != nil {
		t.Fatal(err)
	}
}

func TestSettingsAndDisconnect(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	f.connect(t, "a@example.com", "ta", false, time.Now())
	f.connect(t, "b@example.com", "tb", false, time.Now())
	if err := f.uc.UpdateSettings(ctx, UpdateSettingsInput{SetMaster: true, Master: "x@example.com"}); code(err) != "not_connected" {
		t.Fatalf("err %v", err)
	}
	if err := f.uc.UpdateSettings(ctx, UpdateSettingsInput{SetMaster: true, Master: "b@example.com", PrivateCalendarID: "a@example.com", PrivateValue: true}); err != nil {
		t.Fatal(err)
	}
	status, _ := f.uc.GetStatus(ctx, GetStatusInput{})
	if status.Master != "b@example.com" || !status.Accounts[0].Private {
		t.Fatalf("status %+v", status)
	}
	_, _ = f.uc.RunSync(ctx, RunSyncInput{})

	out, err := f.uc.Disconnect(ctx, DisconnectInput{CalendarID: "b@example.com"})
	if err != nil || out.Deleted != 1 {
		t.Fatalf("out %+v err %v", out, err)
	}
	status, _ = f.uc.GetStatus(ctx, GetStatusInput{})
	if status.Master != "" || len(status.Accounts) != 1 {
		t.Fatalf("status %+v", status)
	}
	mirrors, _ := f.uc.d.Mirrors.SelectAll(ctx)
	for _, m := range mirrors {
		if _, _, target, _ := service.ParseKey(m.Key); target == "b@example.com" {
			t.Fatal("b mirror remains")
		}
	}
}

func TestOAuthConnectKeepsSettingsOnReconnect(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	f.connect(t, "a@example.com", "old", true, time.Now())
	target, err := f.uc.StartConnect(ctx, "a@example.com")
	if err != nil || !strings.Contains(target, "login_hint=a@example.com") {
		t.Fatalf("target %s %v", target, err)
	}
	state := strings.Split(strings.Split(target, "state=")[1], "&")[0]
	id, err := f.uc.FinishConnect(ctx, state, "code1")
	if err != nil || id != "a@example.com" {
		t.Fatalf("id %s %v", id, err)
	}
	a, _ := f.uc.d.Accounts.SelectByPK(ctx, "a@example.com")
	token, _ := f.cipher.Decrypt(a.RefreshToken)
	if token != "refresh-code1" || !a.Private {
		t.Fatalf("account %+v token %s", a, token)
	}
	// state は 1 回しか使えない
	if _, err := f.uc.FinishConnect(ctx, state, "code2"); err == nil || !strings.Contains(err.Error(), "有効期限") {
		t.Fatalf("reuse err %v", err)
	}
}
