// calendarsync は複数の Google アカウントのカレンダーを相互に同期するマイクロサービス（管理者用）。
// RunSync は CronJob が 5 分ごとに Bearer トークンで呼ぶ。アカウント接続の OAuth は HTTP で受ける。
package main

import (
	"log"
	"net/http"
	"strconv"

	"connectrpc.com/connect"

	"github.com/javalangruntimeexception/taramanji/backend/gen/taramanji/calendarsync/v1/calendarsyncv1connect"
	"github.com/javalangruntimeexception/taramanji/backend/internal/calendarsync/di"
	"github.com/javalangruntimeexception/taramanji/backend/internal/calendarsync/handler"
	infragw "github.com/javalangruntimeexception/taramanji/backend/internal/calendarsync/infra/gateway"
	infrarepo "github.com/javalangruntimeexception/taramanji/backend/internal/calendarsync/infra/repository"
	"github.com/javalangruntimeexception/taramanji/backend/internal/calendarsync/usecase"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/auth"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/env"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/logger"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/observability"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/redisx"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/server"
)

const serviceName = "calendarsync"

func main() {
	logger.Init()
	metrics, stop := observability.Init(serviceName)
	defer stop()

	rdb, err := redisx.New(serviceName)
	if err != nil {
		log.Fatal(err)
	}
	cipher, err := infragw.NewCipher(env.Required("CALENDAR_SYNC_ENC_KEY"))
	if err != nil {
		log.Fatal(err)
	}
	// このアプリの正規 URL（gws.taramanji.com）。OAuth のリダイレクト URI と戻り先に使う
	siteURL := env.Required("AUTH_URL")
	oauthCfg := infragw.NewOAuthConfig(env.Required("GOOGLE_CLIENT_ID"), env.Required("GOOGLE_CLIENT_SECRET"),
		siteURL+"/api/calendar-sync/callback")
	days, _ := strconv.Atoi(env.Optional("SYNC_DAYS", "90"))

	uc := usecase.NewCalendarSyncUsecase(usecase.Deps{
		Accounts:  infrarepo.NewRedisCalendarAccountRepository(rdb),
		Settings:  infrarepo.NewRedisSyncSettingRepository(rdb),
		Mirrors:   infrarepo.NewRedisSyncMirrorRepository(rdb),
		Connector: infragw.NewConnector(oauthCfg),
		OAuth:     infragw.NewOAuth(oauthCfg),
		Cipher:    cipher,
		State:     infragw.NewRunState(rdb),
		Metrics:   metrics,
		Days:      days,
	})
	handlers := di.NewHandlers(uc)
	// すべて管理者用。RunSync だけは CronJob の Bearer トークンでも呼べる
	interceptor := auth.AdminInterceptor([]string{
		calendarsyncv1connect.CalendarSyncServiceGetStatusProcedure,
		calendarsyncv1connect.CalendarSyncServiceUpdateSettingsProcedure,
		calendarsyncv1connect.CalendarSyncServiceDisconnectProcedure,
	}, []string{calendarsyncv1connect.CalendarSyncServiceRunSyncProcedure}, env.Required("CALENDAR_SYNC_CRON_TOKEN"))
	oauthHTTP := handler.NewOAuthHandlers(uc, siteURL)

	if err := server.Run(serviceName, func(mux *http.ServeMux) {
		handlers.Register(mux, connect.WithInterceptors(interceptor))
		oauthHTTP.Register(mux)
	}); err != nil {
		log.Fatal(err)
	}
}
