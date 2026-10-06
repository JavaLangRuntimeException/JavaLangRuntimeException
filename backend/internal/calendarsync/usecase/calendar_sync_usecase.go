package usecase

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"log/slog"
	"sort"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/calendarsync/domain/entity"
	"github.com/javalangruntimeexception/taramanji/backend/internal/calendarsync/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/calendarsync/domain/repository"
	"github.com/javalangruntimeexception/taramanji/backend/internal/calendarsync/domain/service"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/auth"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/errs"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/observability"
)

const (
	// CronBudget: CronJob は 5 分ごと。次の回と重ならないよう、新しい書き込みは 4 分で打ち切って次回に回す
	CronBudget = 4 * time.Minute
	// InteractiveBudget: 管理画面の「今すぐ同期」は Cloudflare の 100 秒制限に収まるよう 80 秒で区切る
	InteractiveBudget = 80 * time.Second
	lockTTL           = 10 * time.Minute
	oauthStateTTL     = 10 * time.Minute
	settingID         = "default"
	idleMessage       = "2 つ以上のアカウントを接続すると同期を始めます"
	lockedMessage     = "同期の実行中です。少し待ってからやり直してください"
)

type Deps struct {
	Accounts  repository.CalendarAccountRepository
	Settings  repository.SyncSettingRepository
	Mirrors   repository.SyncMirrorRepository
	Connector gateway.Connector
	OAuth     gateway.OAuth
	Cipher    gateway.Cipher
	State     gateway.RunState
	Metrics   observability.Metrics
	Clock     func() time.Time
	Days      int
}

type CalendarSyncUsecaseImpl struct{ d Deps }

var _ CalendarSyncUsecase = (*CalendarSyncUsecaseImpl)(nil)

func NewCalendarSyncUsecase(d Deps) *CalendarSyncUsecaseImpl {
	if d.Clock == nil {
		d.Clock = time.Now
	}
	if d.Days == 0 {
		d.Days = 90
	}
	return &CalendarSyncUsecaseImpl{d: d}
}

func notConnected(id string) error {
	return errs.NewCodedError(errs.ErrorTypeBadRequest, "not_connected", "接続されていません: "+id)
}

func lockedError() error {
	return errs.NewCodedError(errs.ErrorTypeConcurrency, "sync_locked", lockedMessage)
}

// accounts は接続した順（connectedAt の古い順）
func (u *CalendarSyncUsecaseImpl) accounts(ctx context.Context) ([]*entity.CalendarAccount, error) {
	list, err := u.d.Accounts.SelectAll(ctx)
	if err != nil {
		return nil, err
	}
	sort.SliceStable(list, func(i, j int) bool {
		if !list[i].ConnectedAt.Equal(list[j].ConnectedAt) {
			return list[i].ConnectedAt.Before(list[j].ConnectedAt)
		}
		return list[i].CalendarID < list[j].CalendarID
	})
	return list, nil
}

func (u *CalendarSyncUsecaseImpl) master(ctx context.Context) (string, error) {
	s, err := u.d.Settings.SelectByPK(ctx, settingID)
	if err != nil || s == nil {
		return "", err
	}
	return s.Master, nil
}

func toLastRun(r *gateway.LastRun) *LastRun {
	if r == nil {
		return nil
	}
	out := &LastRun{SourceEvents: int32(r.SourceEvents), Mirrors: int32(r.Mirrors), Writes: int32(r.Writes), Deletes: int32(r.Deletes),
		Pending: int32(r.Pending), At: r.At, DurationMs: r.DurationMs, Reconnect: r.Reconnect, Errors: []*SyncError{}}
	for _, e := range r.Errors {
		out.Errors = append(out.Errors, &SyncError{CalendarID: e.CalendarID, Error: e.Error})
	}
	return out
}

func (u *CalendarSyncUsecaseImpl) GetStatus(ctx context.Context, _ GetStatusInput) (*GetStatusOutput, error) {
	list, err := u.accounts(ctx)
	if err != nil {
		return nil, errs.NewInternalError(err)
	}
	master, err := u.master(ctx)
	if err != nil {
		return nil, errs.NewInternalError(err)
	}
	last, err := u.d.State.LoadLastRun(ctx)
	if err != nil {
		return nil, errs.NewInternalError(err)
	}
	if err := u.ensureColors(ctx, list); err != nil {
		return nil, errs.NewInternalError(err)
	}
	out := &GetStatusOutput{Master: master, Accounts: []*AccountView{}, LastRun: toLastRun(last)}
	for _, a := range list {
		// 更新トークンは返さない
		out.Accounts = append(out.Accounts, &AccountView{CalendarID: a.CalendarID, Private: a.Private,
			ConnectedAt: service.FormatISO(a.ConnectedAt), ColorID: a.ColorID})
	}
	return out, nil
}

// ensureColors は色が決まっていないアカウントに、接続した順で使われていない色を割り当てて保存する
func (u *CalendarSyncUsecaseImpl) ensureColors(ctx context.Context, list []*entity.CalendarAccount) error {
	var used []string
	for _, a := range list {
		if a.ColorID != "" {
			used = append(used, a.ColorID)
		}
	}
	for _, a := range list {
		if a.ColorID != "" {
			continue
		}
		a.ColorID = service.NextColor(used)
		used = append(used, a.ColorID)
		if err := u.d.Accounts.Upsert(ctx, a); err != nil {
			return err
		}
	}
	return nil
}

// withLock は同期と接続解除を同時に走らせない（同期の記録を上書きし合うため）
func (u *CalendarSyncUsecaseImpl) withLock(ctx context.Context, fn func() error) error {
	unlock, err := u.d.State.Lock(ctx, lockTTL)
	if err != nil {
		return err
	}
	defer unlock()
	return fn()
}

func (u *CalendarSyncUsecaseImpl) RunSync(ctx context.Context, _ RunSyncInput) (*RunSyncOutput, error) {
	cron := auth.IsCron(ctx)
	budget := InteractiveBudget
	if cron {
		budget = CronBudget
	}
	var run *gateway.LastRun
	err := u.withLock(ctx, func() error {
		var err error
		run, err = u.runLocked(ctx, budget)
		return err
	})
	if errors.Is(err, gateway.ErrLocked) {
		u.d.Metrics.Count("calendar_sync.run", 1, "status:skipped")
		// 前の回がまだ動いている。CronJob は失敗扱いにしない（次の回で続きをやる）
		if cron {
			return &RunSyncOutput{Skipped: true}, nil
		}
		return nil, lockedError()
	}
	if err != nil {
		u.d.Metrics.Count("calendar_sync.run", 1, "status:failed")
		return nil, errs.NewInternalError(err).WithCode("sync_failed")
	}
	return &RunSyncOutput{Run: toLastRun(run)}, nil
}

func (u *CalendarSyncUsecaseImpl) loadMirrors(ctx context.Context) (service.Mirrors, error) {
	list, err := u.d.Mirrors.SelectAll(ctx)
	if err != nil {
		return nil, err
	}
	m := service.Mirrors{}
	for _, e := range list {
		m[e.Key] = service.Mirror{Digest: e.Digest, EndAt: e.EndAt}
	}
	return m, nil
}

// saveMirrors は前回から変わった記録だけを書き、なくなった記録を消す
func (u *CalendarSyncUsecaseImpl) saveMirrors(ctx context.Context, before, after service.Mirrors) error {
	var upserts []*entity.SyncMirror
	for k, v := range after {
		if prev, ok := before[k]; ok && prev == v {
			continue
		}
		upserts = append(upserts, &entity.SyncMirror{Key: k, Digest: v.Digest, EndAt: v.EndAt})
	}
	var deletes []string
	for k := range before {
		if _, ok := after[k]; !ok {
			deletes = append(deletes, k)
		}
	}
	if len(upserts) > 0 {
		if err := u.d.Mirrors.BulkUpsert(ctx, upserts); err != nil {
			return err
		}
	}
	if len(deletes) > 0 {
		return u.d.Mirrors.BulkDelete(ctx, deletes)
	}
	return nil
}

func (u *CalendarSyncUsecaseImpl) connectAll(ctx context.Context, list []*entity.CalendarAccount) ([]gateway.Calendar, []string, []gateway.SyncError) {
	var cals []gateway.Calendar
	reconnect := []string{}
	var errors []gateway.SyncError
	for _, a := range list {
		token, err := u.d.Cipher.Decrypt(a.RefreshToken)
		var cal gateway.Calendar
		if err == nil {
			cal, err = u.d.Connector.Connect(ctx, a.CalendarID, token)
		}
		if err != nil {
			// 更新トークンの失効（パスワード変更・アクセス取り消し・組織のポリシー）など
			reconnect = append(reconnect, a.CalendarID)
			errors = append(errors, gateway.SyncError{CalendarID: a.CalendarID, Error: err.Error()})
			continue
		}
		cals = append(cals, cal)
	}
	return cals, reconnect, errors
}

func (u *CalendarSyncUsecaseImpl) runLocked(ctx context.Context, budget time.Duration) (*gateway.LastRun, error) {
	started := u.d.Clock()
	list, err := u.accounts(ctx)
	if err != nil {
		return nil, err
	}
	if len(list) < 2 {
		idle := &gateway.LastRun{Reconnect: []string{}, At: service.FormatISO(started),
			Errors: []gateway.SyncError{{CalendarID: "-", Error: idleMessage}}}
		return idle, u.d.State.SaveLastRun(ctx, idle)
	}
	master, err := u.master(ctx)
	if err != nil {
		return nil, err
	}
	before, err := u.loadMirrors(ctx)
	if err != nil {
		return nil, err
	}
	if err := u.ensureColors(ctx, list); err != nil {
		return nil, err
	}
	cals, reconnect, connErrors := u.connectAll(ctx, list)
	private := map[string]bool{}
	colors := map[string]string{}
	for _, a := range list {
		if a.Private {
			private[a.CalendarID] = true
		}
		colors[a.CalendarID] = a.ColorID
	}
	state := &service.State{Master: master, Mirrors: before}
	res, err := service.Reconcile(ctx, cals, state, service.Options{
		Now: started, Days: u.d.Days, PrivateSources: private, Colors: colors, Deadline: started.Add(budget),
		Unavailable: reconnect, Clock: u.d.Clock,
	})
	if err != nil {
		return nil, err
	}
	if err := u.saveMirrors(ctx, before, state.Mirrors); err != nil {
		return nil, err
	}
	run := &gateway.LastRun{
		SourceEvents: res.SourceEvents, Mirrors: res.Mirrors, Writes: res.Writes, Deletes: res.Deletes, Pending: res.Pending,
		Errors: append(connErrors, res.Errors...), At: service.FormatISO(started),
		DurationMs: u.d.Clock().Sub(started).Milliseconds(), Reconnect: reconnect,
	}
	if run.Errors == nil {
		run.Errors = []gateway.SyncError{}
	}
	if err := u.d.State.SaveLastRun(ctx, run); err != nil {
		return nil, err
	}
	u.report(run, len(list))
	slog.InfoContext(ctx, "calendar sync finished", "source_events", run.SourceEvents, "mirrors", run.Mirrors, "writes", run.Writes,
		"deletes", run.Deletes, "pending", run.Pending, "errors", len(run.Errors), "reconnect", run.Reconnect, "duration_ms", run.DurationMs)
	for _, e := range run.Errors {
		slog.WarnContext(ctx, "calendar sync error", "calendar_id", e.CalendarID, "error", e.Error)
	}
	return run, nil
}

// report は Datadog へ 1 回の同期の結果を送る（旧実装と同じメトリクス名。ダッシュボードとモニターが使う）
func (u *CalendarSyncUsecaseImpl) report(run *gateway.LastRun, accounts int) {
	status := "ok"
	if len(run.Errors) > 0 {
		status = "error"
	} else if run.Pending > 0 {
		status = "partial"
	}
	m := u.d.Metrics
	m.Count("calendar_sync.run", 1, "status:"+status)
	m.Timing("calendar_sync.run.duration_ms", time.Duration(run.DurationMs)*time.Millisecond)
	m.Count("calendar_sync.writes", int64(run.Writes))
	m.Count("calendar_sync.deletes", int64(run.Deletes))
	m.Count("calendar_sync.errors", int64(len(run.Errors)))
	m.Gauge("calendar_sync.pending", float64(run.Pending))
	m.Gauge("calendar_sync.source_events", float64(run.SourceEvents))
	m.Gauge("calendar_sync.mirrors", float64(run.Mirrors))
	m.Gauge("calendar_sync.accounts", float64(accounts))
	m.Gauge("calendar_sync.accounts.reconnect_needed", float64(len(run.Reconnect)))
}

func (u *CalendarSyncUsecaseImpl) UpdateSettings(ctx context.Context, in UpdateSettingsInput) error {
	list, err := u.accounts(ctx)
	if err != nil {
		return errs.NewInternalError(err)
	}
	find := func(id string) *entity.CalendarAccount {
		for _, a := range list {
			if a.CalendarID == id {
				return a
			}
		}
		return nil
	}
	if in.SetMaster {
		if in.Master != "" && find(in.Master) == nil {
			return notConnected(in.Master)
		}
		if err := u.d.Settings.Upsert(ctx, &entity.SyncSetting{ID: settingID, Master: in.Master}); err != nil {
			return errs.NewInternalError(err)
		}
	}
	if in.ColorCalendarID != "" {
		a := find(in.ColorCalendarID)
		if a == nil {
			return notConnected(in.ColorCalendarID)
		}
		if !service.ValidColor(in.ColorID) {
			return errs.NewValidationError("color_id", "色は 1〜11 のどれかを選んでください").WithCode("invalid_color")
		}
		a.ColorID = in.ColorID
		if err := u.d.Accounts.Upsert(ctx, a); err != nil {
			return errs.NewInternalError(err)
		}
	}
	if in.PrivateCalendarID != "" {
		a := find(in.PrivateCalendarID)
		if a == nil {
			return notConnected(in.PrivateCalendarID)
		}
		a.Private = in.PrivateValue
		if err := u.d.Accounts.Upsert(ctx, a); err != nil {
			return errs.NewInternalError(err)
		}
	}
	return nil
}

func (u *CalendarSyncUsecaseImpl) Disconnect(ctx context.Context, in DisconnectInput) (*DisconnectOutput, error) {
	var out *DisconnectOutput
	err := u.withLock(ctx, func() error {
		account, err := u.d.Accounts.SelectByPK(ctx, in.CalendarID)
		if err != nil {
			return errs.NewInternalError(err)
		}
		if account == nil {
			return notConnected(in.CalendarID)
		}
		before, err := u.loadMirrors(ctx)
		if err != nil {
			return errs.NewInternalError(err)
		}
		var result service.RemoveResult
		token, err := u.d.Cipher.Decrypt(account.RefreshToken)
		var cal gateway.Calendar
		if err == nil {
			cal, err = u.d.Connector.Connect(ctx, account.CalendarID, token)
		}
		if err == nil {
			result = service.RemoveMirrorsIn(ctx, cal, before)
		} else {
			// トークンが失効していて消せない。記録だけ外す（残った「予定あり」は手動で削除してもらう）
			result.Remaining, result.Failed = service.DropTarget(before, account.CalendarID)
		}
		if err := u.saveMirrors(ctx, before, result.Remaining); err != nil {
			return errs.NewInternalError(err)
		}
		master, err := u.master(ctx)
		if err != nil {
			return errs.NewInternalError(err)
		}
		if master == account.CalendarID {
			if err := u.d.Settings.Upsert(ctx, &entity.SyncSetting{ID: settingID}); err != nil {
				return errs.NewInternalError(err)
			}
		}
		if err := u.d.Accounts.Delete(ctx, account.CalendarID); err != nil {
			return errs.NewInternalError(err)
		}
		out = &DisconnectOutput{Deleted: int32(result.Deleted), Failed: int32(result.Failed)}
		return nil
	})
	if errors.Is(err, gateway.ErrLocked) {
		return nil, lockedError()
	}
	return out, err
}

// StartConnect は Google の同意画面の URL を作る（state と PKCE の verifier を 10 分だけ保存）
func (u *CalendarSyncUsecaseImpl) StartConnect(ctx context.Context, hint string) (string, error) {
	state, verifier := randomToken(32), randomToken(64)
	sum := sha256.Sum256([]byte(verifier))
	if err := u.d.State.SaveOAuthState(ctx, state, verifier, oauthStateTTL); err != nil {
		return "", err
	}
	return u.d.OAuth.AuthURL(state, base64.RawURLEncoding.EncodeToString(sum[:]), hint), nil
}

// FinishConnect は Google から戻ってきたら更新トークンを暗号化して保存し、接続したカレンダー ID を返す。
// 返すエラーのメッセージは管理画面にそのまま出す
func (u *CalendarSyncUsecaseImpl) FinishConnect(ctx context.Context, state, code string) (string, error) {
	verifier, err := u.d.State.TakeOAuthState(ctx, state)
	if err != nil {
		return "", err
	}
	if verifier == "" {
		return "", errors.New("認証の有効期限が切れました。もう一度接続してください")
	}
	refresh, calendarID, err := u.d.OAuth.Exchange(ctx, code, verifier)
	if err != nil {
		return "", err
	}
	sealed, err := u.d.Cipher.Encrypt(refresh)
	if err != nil {
		return "", err
	}
	existing, err := u.d.Accounts.SelectByPK(ctx, calendarID)
	if err != nil {
		return "", err
	}
	account := &entity.CalendarAccount{CalendarID: calendarID, RefreshToken: sealed, ConnectedAt: u.d.Clock()}
	if existing != nil {
		// 再接続: トークンだけ入れ替え、設定（非公開・色）は残す
		account.Private = existing.Private
		account.ColorID = existing.ColorID
	} else {
		list, err := u.accounts(ctx)
		if err != nil {
			return "", err
		}
		var used []string
		for _, a := range list {
			used = append(used, a.ColorID)
		}
		account.ColorID = service.NextColor(used)
	}
	if err := u.d.Accounts.Upsert(ctx, account); err != nil {
		return "", err
	}
	u.d.Metrics.Count("calendar_sync.connect", 1, fmt.Sprintf("reconnect:%t", existing != nil))
	return calendarID, nil
}

func randomToken(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}
