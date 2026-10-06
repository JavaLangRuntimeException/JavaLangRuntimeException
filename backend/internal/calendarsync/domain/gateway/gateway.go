// Package gateway はカレンダー同期が使う外部（Google Calendar・OAuth・暗号化・実行状態）の抽象。
package gateway

import (
	"context"
	"errors"
	"time"
)

// EventTime は Google の start / end をそのまま持つ（{dateTime, timeZone} か {date}）。
// 同期予定の本文にそのまま入り、ダイジェストの計算にも使うため、型を決めずに値を保つ
type EventTime map[string]any

func (t EventTime) str(k string) string {
	s, _ := t[k].(string)
	return s
}

func (t EventTime) DateTime() string { return t.str("dateTime") }
func (t EventTime) Date() string     { return t.str("date") }

type Attendee struct {
	Self           bool   `json:"self,omitempty"`
	ResponseStatus string `json:"responseStatus,omitempty"`
	Email          string `json:"email,omitempty"`
}

// Event は Google Calendar の予定（同期に使う項目だけ）
type Event struct {
	ID                 string            `json:"id"`
	Status             string            `json:"status,omitempty"`
	Transparency       string            `json:"transparency,omitempty"`
	EventType          string            `json:"eventType,omitempty"`
	Start              EventTime         `json:"start,omitempty"`
	End                EventTime         `json:"end,omitempty"`
	Summary            string            `json:"summary,omitempty"`
	Description        string            `json:"description,omitempty"`
	Location           string            `json:"location,omitempty"`
	HangoutLink        string            `json:"hangoutLink,omitempty"`
	ICalUID            string            `json:"iCalUID,omitempty"`
	Attendees          []Attendee        `json:"attendees,omitempty"`
	ExtendedProperties *ExtendedProperty `json:"extendedProperties,omitempty"`
}

type ExtendedProperty struct {
	Private map[string]string `json:"private,omitempty"`
}

// MirrorBody は同期先に書く予定の本文（Google Calendar API の Event の一部）
type MirrorBody struct {
	Summary      string
	Start, End   EventTime
	Transparency string // opaque / transparent
	Visibility   string // private / default
	Marker       map[string]string
	Description  *string
	Location     *string
}

// Calendar は接続したアカウントのメインカレンダー（ID はメールアドレス）
type Calendar interface {
	ID() string
	Events(ctx context.Context, start, end time.Time) ([]Event, error)
	// Upsert は eventID の予定を作るか更新する。isNew は前回の記録がない（まだ作っていないはず）
	Upsert(ctx context.Context, eventID string, body MirrorBody, isNew bool) error
	// Delete はすでに無い（404 / 410）場合も成功
	Delete(ctx context.Context, eventID string) error
}

// Connector は更新トークンからカレンダーにつなぐ。失効していればエラー（要再接続）
type Connector interface {
	Connect(ctx context.Context, calendarID, refreshToken string) (Calendar, error)
}

// OAuth はアカウント接続の同意画面とトークン交換
type OAuth interface {
	AuthURL(state, codeChallenge, loginHint string) string
	// Exchange は認可コードを交換し、更新トークンとメインカレンダー ID（メールアドレス）を返す
	Exchange(ctx context.Context, code, verifier string) (refreshToken, calendarID string, err error)
}

// Cipher は更新トークンの暗号化（AES-256-GCM、旧実装と同じ形式）
type Cipher interface {
	Encrypt(plain string) (string, error)
	Decrypt(sealed string) (string, error)
}

// ErrLocked は同期・接続解除がすでに実行中
var ErrLocked = errors.New("calendar sync is running")

// LastRun は前回の同期結果（管理画面に出す）
type LastRun struct {
	SourceEvents int         `json:"sourceEvents"`
	Mirrors      int         `json:"mirrors"`
	Writes       int         `json:"writes"`
	Deletes      int         `json:"deletes"`
	Pending      int         `json:"pending"`
	Errors       []SyncError `json:"errors"`
	At           string      `json:"at"`
	DurationMs   int64       `json:"durationMs"`
	Reconnect    []string    `json:"reconnect"`
}

type SyncError struct {
	CalendarID string `json:"calendarId"`
	Error      string `json:"error"`
}

// RunState は同期の実行状態（排他ロック・前回の結果・OAuth の state）。Redis に置く
type RunState interface {
	// Lock は ttl の間だけ排他する。取れなければ ErrLocked。返り値で解放する
	Lock(ctx context.Context, ttl time.Duration) (unlock func(), err error)
	LoadLastRun(ctx context.Context) (*LastRun, error)
	SaveLastRun(ctx context.Context, r *LastRun) error
	SaveOAuthState(ctx context.Context, state, verifier string, ttl time.Duration) error
	// TakeOAuthState は一度しか使えないよう、読むと同時に消す。無ければ空
	TakeOAuthState(ctx context.Context, state string) (string, error)
}
