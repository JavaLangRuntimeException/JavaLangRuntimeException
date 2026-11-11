// inquiry はお問い合わせ・アンケート・管理者からのメール送信のマイクロサービス。
// メール送信は notification サービスを gRPC で呼ぶ。
package main

import (
	"log"
	"net/http"
	"time"

	"connectrpc.com/connect"

	"github.com/javalangruntimeexception/taramanji/backend/gen/taramanji/inquiry/v1/inquiryv1connect"
	"github.com/javalangruntimeexception/taramanji/backend/internal/inquiry/di"
	infragw "github.com/javalangruntimeexception/taramanji/backend/internal/inquiry/infra/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/inquiry/usecase"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/auth"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/env"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/logger"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/observability"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/ratelimit"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/server"
)

const (
	serviceName = "inquiry"
	// 添付 5 個 × 3MB に余裕を持たせた上限
	maxRequestBytes = 20 << 20
)

func main() {
	logger.Init()
	metrics, stop := observability.Init(serviceName)
	defer stop()

	uc := usecase.NewInquiryUsecase(
		infragw.NewNotificationClient(env.ServiceURL("notification")),
		// お問い合わせの通知先。管理画面にログインできる人（ADMIN_EMAIL）とは分ける
		env.Optional("INQUIRY_NOTIFY_EMAIL", env.AdminEmails()),
		env.Optional("QUESTIONNAIRE_EMAIL", "tanahashishuta@gmail.com"),
		metrics,
	)
	handlers := di.NewHandlers(uc)
	adminOnly := auth.AdminInterceptor([]string{inquiryv1connect.InquiryServiceSendAdminEmailProcedure}, nil, "")
	// メール送信の濫用を防ぐ（IP ごと）。アンケートは実験室から同じ IP で何人も答えるので緩め
	limit := ratelimit.Interceptor(map[string]ratelimit.Rule{
		inquiryv1connect.InquiryServiceSubmitContactProcedure:       {Burst: 5, Every: 2 * time.Minute},
		inquiryv1connect.InquiryServiceSubmitQuestionnaireProcedure: {Burst: 20, Every: 30 * time.Second},
	})

	if err := server.Run(serviceName, func(mux *http.ServeMux) {
		handlers.Register(mux, connect.WithInterceptors(limit, adminOnly), connect.WithReadMaxBytes(maxRequestBytes))
	}); err != nil {
		log.Fatal(err)
	}
}
