// migrate-legacy は旧構成（Next.js 時代）の Redis のデータを、新しい Redis（サービスごとの DB・1 レコード 1 キー）へ移す運用ツール。
// 書き込みは生成された Repository 経由なので、各サービスが読む形と必ず一致する。
//
//	# 確認だけ（既定）: 件数と差分を表示する
//	go run ./cmd/migrate-legacy -worklocation-src "$REDIS_CLOUD_URL" -calsync-src redis://localhost:16380/0 -dst redis://admin:...@localhost:16379
//	# 書き込む
//	go run ./cmd/migrate-legacy ... -apply
//	# 移したカレンダー同期の記録で「書き込みが発生しないか」を確かめる（Google を読むだけ。書き込まない）
//	CALENDAR_SYNC_ENC_KEY=... GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... go run ./cmd/migrate-legacy -dst ... -verify-sync
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"
	"sort"
	"time"

	"github.com/redis/go-redis/v9"

	csentity "github.com/javalangruntimeexception/taramanji/backend/internal/calendarsync/domain/entity"
	csgateway "github.com/javalangruntimeexception/taramanji/backend/internal/calendarsync/domain/gateway"
	csservice "github.com/javalangruntimeexception/taramanji/backend/internal/calendarsync/domain/service"
	csinfragw "github.com/javalangruntimeexception/taramanji/backend/internal/calendarsync/infra/gateway"
	csrepo "github.com/javalangruntimeexception/taramanji/backend/internal/calendarsync/infra/repository"
	wlentity "github.com/javalangruntimeexception/taramanji/backend/internal/worklocation/domain/entity"
	wlrepo "github.com/javalangruntimeexception/taramanji/backend/internal/worklocation/infra/repository"
)

// 新しい Redis の DB 番号（deploy/k8s/overlays/kind/make-secrets.sh と同じ）
const (
	dbWorkLocation = 0
	dbCalendarSync = 2
)

type legacyAccounts struct {
	Master   *string `json:"master"`
	Accounts []struct {
		CalendarID   string `json:"calendarId"`
		RefreshToken string `json:"refreshToken"`
		Private      bool   `json:"private"`
		ConnectedAt  string `json:"connectedAt"`
	} `json:"accounts"`
}

func open(url string, db int) *redis.Client {
	opt, err := redis.ParseURL(url)
	if err != nil {
		log.Fatalf("redis url: %v", err)
	}
	if db >= 0 {
		opt.DB = db
	}
	return redis.NewClient(opt)
}

func getJSON(ctx context.Context, c *redis.Client, key string, v any) (bool, error) {
	raw, err := c.Get(ctx, key).Bytes()
	if errors.Is(err, redis.Nil) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, json.Unmarshal(raw, v)
}

func main() {
	wlSrc := flag.String("worklocation-src", "", "旧 Redis（Redis Cloud）の URL。work_locations を読む")
	csSrc := flag.String("calsync-src", "", "旧 calendar-sync の Redis の URL。cal_sync:* を読む")
	dst := flag.String("dst", "", "新しい Redis の URL（admin ユーザー。DB 番号はツールが選ぶ）")
	apply := flag.Bool("apply", false, "実際に書き込む（付けなければ確認だけ）")
	verify := flag.Bool("verify-sync", false, "移した同期の記録で、次の同期が何件書き込むかを Google を読むだけで確かめる")
	flag.Parse()
	if *dst == "" {
		log.Fatal("-dst が必要です")
	}
	ctx := context.Background()

	if *wlSrc != "" {
		migrateWorkLocations(ctx, open(*wlSrc, -1), open(*dst, dbWorkLocation), *apply)
	}
	if *csSrc != "" {
		migrateCalendarSync(ctx, open(*csSrc, -1), open(*dst, dbCalendarSync), *apply)
	}
	if *verify {
		verifySync(ctx, open(*dst, dbCalendarSync))
	}
}

func migrateWorkLocations(ctx context.Context, src, dst *redis.Client, apply bool) {
	var m map[string]string
	ok, err := getJSON(ctx, src, "work_locations", &m)
	if err != nil {
		log.Fatalf("work_locations: %v", err)
	}
	if !ok {
		log.Println("work_locations: 旧データなし")
		return
	}
	repo := wlrepo.NewRedisWorkLocationRepository(dst)
	existing, err := repo.SelectAll(ctx)
	if err != nil {
		log.Fatal(err)
	}
	var list []*wlentity.WorkLocation
	for date, loc := range m {
		e, err := wlentity.NewWorkLocation(date, loc)
		if err != nil {
			log.Printf("  スキップ %s: %v", date, err)
			continue
		}
		list = append(list, e)
	}
	sort.Slice(list, func(i, j int) bool { return list[i].Date < list[j].Date })
	fmt.Printf("work_locations: 旧 %d 日 → 新（既存 %d 件）", len(list), len(existing))
	if !apply {
		fmt.Println(" [確認のみ]")
		return
	}
	if err := repo.BulkUpsert(ctx, list); err != nil {
		log.Fatal(err)
	}
	fmt.Println(" 書き込みました")
}

func migrateCalendarSync(ctx context.Context, src, dst *redis.Client, apply bool) {
	var accounts legacyAccounts
	if _, err := getJSON(ctx, src, "cal_sync:accounts", &accounts); err != nil {
		log.Fatalf("cal_sync:accounts: %v", err)
	}
	var mirrors map[string][2]string
	if _, err := getJSON(ctx, src, "cal_sync:mirrors", &mirrors); err != nil {
		log.Fatalf("cal_sync:mirrors: %v", err)
	}
	lastRun, _ := src.Get(ctx, "cal_sync:last_run").Bytes()

	var accs []*csentity.CalendarAccount
	for _, a := range accounts.Accounts {
		at, err := time.Parse(time.RFC3339, a.ConnectedAt)
		if err != nil {
			at = time.Now()
		}
		accs = append(accs, &csentity.CalendarAccount{CalendarID: a.CalendarID, RefreshToken: a.RefreshToken, Private: a.Private, ConnectedAt: at})
	}
	var ms []*csentity.SyncMirror
	for k, v := range mirrors {
		ms = append(ms, &csentity.SyncMirror{Key: k, Digest: v[0], EndAt: v[1]})
	}
	master := ""
	if accounts.Master != nil {
		master = *accounts.Master
	}
	fmt.Printf("calendar-sync: アカウント %d 件、同期の記録 %d 件、マスター %q、前回の結果 %d バイト", len(accs), len(ms), master, len(lastRun))
	if !apply {
		fmt.Println(" [確認のみ]")
		return
	}
	if err := csrepo.NewRedisCalendarAccountRepository(dst).BulkUpsert(ctx, accs); err != nil {
		log.Fatal(err)
	}
	if err := csrepo.NewRedisSyncSettingRepository(dst).Upsert(ctx, &csentity.SyncSetting{ID: "default", Master: master}); err != nil {
		log.Fatal(err)
	}
	if err := csrepo.NewRedisSyncMirrorRepository(dst).BulkUpsert(ctx, ms); err != nil {
		log.Fatal(err)
	}
	if len(lastRun) > 0 {
		if err := dst.Set(ctx, "cal_sync:last_run", lastRun, 0).Err(); err != nil {
			log.Fatal(err)
		}
	}
	fmt.Println(" 書き込みました")
}

// dryCalendar は予定を読むだけで、書き込み・削除は数えるだけにする
type dryCalendar struct {
	csgateway.Calendar
	writes, deletes *int
}

func (d dryCalendar) Upsert(context.Context, string, csgateway.MirrorBody, bool) error {
	*d.writes++
	return nil
}

func (d dryCalendar) Delete(context.Context, string) error {
	*d.deletes++
	return nil
}

func verifySync(ctx context.Context, dst *redis.Client) {
	cipher, err := csinfragw.NewCipher(os.Getenv("CALENDAR_SYNC_ENC_KEY"))
	if err != nil {
		log.Fatal(err)
	}
	cfg := csinfragw.NewOAuthConfig(os.Getenv("GOOGLE_CLIENT_ID"), os.Getenv("GOOGLE_CLIENT_SECRET"), "")
	connector := csinfragw.NewConnector(cfg)
	accs, err := csrepo.NewRedisCalendarAccountRepository(dst).SelectAll(ctx)
	if err != nil {
		log.Fatal(err)
	}
	setting, _ := csrepo.NewRedisSyncSettingRepository(dst).SelectByPK(ctx, "default")
	stored, err := csrepo.NewRedisSyncMirrorRepository(dst).SelectAll(ctx)
	if err != nil {
		log.Fatal(err)
	}
	mirrors := csservice.Mirrors{}
	for _, m := range stored {
		mirrors[m.Key] = csservice.Mirror{Digest: m.Digest, EndAt: m.EndAt}
	}
	var writes, deletes int
	var cals []csgateway.Calendar
	var unavailable []string
	private := map[string]bool{}
	for _, a := range accs {
		if a.Private {
			private[a.CalendarID] = true
		}
		token, err := cipher.Decrypt(a.RefreshToken)
		var cal csgateway.Calendar
		if err == nil {
			cal, err = connector.Connect(ctx, a.CalendarID, token)
		}
		if err != nil {
			fmt.Printf("  要再接続: %s (%v)\n", a.CalendarID, err)
			unavailable = append(unavailable, a.CalendarID)
			continue
		}
		cals = append(cals, dryCalendar{Calendar: cal, writes: &writes, deletes: &deletes})
	}
	master := ""
	if setting != nil {
		master = setting.Master
	}
	state := &csservice.State{Master: master, Mirrors: mirrors}
	res, err := csservice.Reconcile(ctx, cals, state, csservice.Options{PrivateSources: private, Unavailable: unavailable})
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("verify-sync: 元の予定 %d 件、同期予定 %d 件 → 次の同期で書き込み %d 件・削除 %d 件（0 に近ければ旧実装と同じ本文・ID）、エラー %d 件\n",
		res.SourceEvents, res.Mirrors, writes, deletes, len(res.Errors))
	for _, e := range res.Errors {
		fmt.Printf("  エラー: %s: %s\n", e.CalendarID, e.Error)
	}
}
