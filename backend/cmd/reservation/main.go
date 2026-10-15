// reservation はお打ち合わせ予約のマイクロサービス（予約の作成・取得・取消、空き時間、Google マップの場所名）。
// 予約できる日かは worklocation サービスに gRPC で問い合わせる。
package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"

	"connectrpc.com/connect"

	"github.com/javalangruntimeexception/taramanji/backend/gen/taramanji/reservation/v1/reservationv1connect"
	"github.com/javalangruntimeexception/taramanji/backend/internal/reservation/di"
	"github.com/javalangruntimeexception/taramanji/backend/internal/reservation/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/reservation/domain/service"
	infragw "github.com/javalangruntimeexception/taramanji/backend/internal/reservation/infra/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/reservation/usecase"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/auth"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/env"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/logger"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/observability"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/server"
)

const serviceName = "reservation"

var webcal = regexp.MustCompile(`(?i)^webcal://`)

// icalSources は ICAL_URLS（カンマ区切り）か ICAL_URL_1〜19 から iCal の URL を集める（旧実装と同じ）
func icalSources() []gateway.IcalSource {
	var urls []string
	if csv := strings.TrimSpace(os.Getenv("ICAL_URLS")); csv != "" {
		for _, u := range strings.Split(csv, ",") {
			if u = strings.TrimSpace(u); u != "" {
				urls = append(urls, u)
			}
		}
	} else {
		for i := 1; i <= 19; i++ {
			if v := strings.TrimSpace(os.Getenv(fmt.Sprintf("ICAL_URL_%d", i))); v != "" {
				urls = append(urls, v)
			}
		}
	}
	var out []gateway.IcalSource
	for i, u := range urls {
		out = append(out, gateway.IcalSource{
			URL:  webcal.ReplaceAllString(u, "https://"),
			Name: env.Optional(fmt.Sprintf("ICAL_NAME_%d", i+1), fmt.Sprintf("Calendar %d", i+1)),
		})
	}
	return out
}

func main() {
	logger.Init()
	metrics, stop := observability.Init(serviceName)
	defer stop()

	// 予約は Google Calendar API に直接書く。本番はサービスアカウントが GCAL_SA_SUBJECT になりかわる（ドメイン全体の委任）。
	// primary はなりかわった人のメインのカレンダー
	calendarID := env.Optional("GCAL_CALENDAR_ID", "primary")
	creds := infragw.GoogleCredentials{
		ServiceAccountJSONBase64: os.Getenv("GCAL_SA_JSON_BASE64"),
		Subject:                  os.Getenv("GCAL_SA_SUBJECT"),
		ClientID:                 os.Getenv("GOOGLE_CLIENT_ID"),
		ClientSecret:             os.Getenv("GOOGLE_CLIENT_SECRET"),
		RefreshToken:             os.Getenv("GOOGLE_REFRESH_TOKEN"),
	}
	tokens, err := creds.TokenSource(context.Background())
	if err != nil {
		log.Fatal(err)
	}
	var cfg usecase.Config
	if tokens != nil {
		cfg.Primary = infragw.NewGoogleCalendar(calendarID, tokens, nil)
	} else if env.AppEnv() != "local" {
		// 認証情報がないと予約が全部失敗する。気づかずに出さないよう起動しない（手元だけは予約なしで動かせる）
		log.Fatal("GCAL_SA_JSON_BASE64（または GOOGLE_REFRESH_TOKEN）が未設定")
	}
	offset := 9 * 60
	if v := os.Getenv("ICAL_TZ_OFFSET_MINUTES"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			offset = n
		}
	}
	cfg.Ical = service.NewIcsParser(offset)
	cfg.Sources = icalSources()

	uc := usecase.NewReservationUsecase(cfg,
		infragw.NewWorkLocationClient(env.ServiceURL("worklocation")),
		infragw.NewIcalFetcher(), infragw.NewMapsFetcher(), metrics)
	handlers := di.NewHandlers(uc)
	adminOnly := auth.AdminInterceptor([]string{reservationv1connect.ReservationServiceListIcalSourcesProcedure}, nil, "")

	if err := server.Run(serviceName, func(mux *http.ServeMux) {
		handlers.Register(mux, connect.WithInterceptors(adminOnly))
	}); err != nil {
		log.Fatal(err)
	}
}
