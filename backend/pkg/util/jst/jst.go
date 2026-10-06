// Package jst は日本時間。予約・勤務場所などの日付計算はサーバーの TZ に依存させない。
// 「いま」は各コンストラクタに clock func() time.Time で注入する（CLAUDE.md の規約）。
package jst

import "time"

var Location = func() *time.Location {
	loc, err := time.LoadLocation("Asia/Tokyo")
	if err != nil {
		return time.FixedZone("JST", 9*60*60)
	}
	return loc
}()

// Date は JST の日付（YYYY-MM-DD）
func Date(t time.Time) string { return t.In(Location).Format(time.DateOnly) }
