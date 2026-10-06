// Package gateway は予約が使う外部の抽象。実装は infra/gateway。
package gateway

import (
	"context"
	"time"
)

// Event は書き込む予定（日時は日本時間）
type Event struct {
	Summary     string
	Description string
	Location    string
	Start, End  time.Time
	Attendees   []string
	CreateMeet  bool
	// ContactMethod は GAS ウェブフックにそのまま渡す（Meet を作るかの判断に使う）
	ContactMethod string
}

// Created は予約の作成・取得の結果。EventID が空なら、作成はできたが ID を確かめられなかった
type Created struct {
	EventID  string
	HTMLLink string
	MeetLink string
	Invited  bool
	Note     string
}

// Calendar は予約を書き込む先（Google Calendar API か Google Apps Script のウェブフック）。
// 失敗は errs.DomainError（ErrorTypeUpstream と旧 API のエラーコード）で返す。
type Calendar interface {
	Name() string
	Create(ctx context.Context, e Event) (*Created, error)
	Get(ctx context.Context, eventID string) (*Created, error)
	// Delete は消した場合 true。すでにない場合（404）は false で成功扱い
	Delete(ctx context.Context, eventID string) (bool, error)
}

// WorkLocations は勤務場所（worklocation サービス）
type WorkLocations interface {
	// Get は日付（YYYY-MM-DD）の勤務場所。未登録なら空
	Get(ctx context.Context, date string) (string, error)
}

// IcalSource は空き時間の計算に使う iCal の URL（環境変数で設定）
type IcalSource struct {
	URL  string
	Name string
}

// Fetched は iCal の取得結果。取得できなければ OK=false（Status 0 は通信エラー）
type Fetched struct {
	OK     bool
	Status int
	Body   string
}

type IcalFetcher interface {
	Fetch(ctx context.Context, url string) Fetched
}

// Page は Google マップのリンクをたどった結果
type Page struct {
	FinalURL string
	HTML     string
}

// MapsFetcher は Google マップの共有リンクをたどる（Google マップ以外へは転送されてもたどらない）
type MapsFetcher interface {
	Fetch(ctx context.Context, url string) (*Page, error)
}
