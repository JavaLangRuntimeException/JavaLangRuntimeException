// notification はメール送信（Amazon SES）のマイクロサービス。クラスター内から gRPC でだけ呼ばれる。
package main

import (
	"log"
	"net/http"

	"github.com/javalangruntimeexception/taramanji/backend/internal/notification/di"
	"github.com/javalangruntimeexception/taramanji/backend/internal/notification/domain/service"
	infragw "github.com/javalangruntimeexception/taramanji/backend/internal/notification/infra/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/notification/usecase"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/env"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/logger"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/observability"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/server"
)

const serviceName = "notification"

func main() {
	logger.Init()
	metrics, stop := observability.Init(serviceName)
	defer stop()

	mailer := infragw.NewSESMailer(
		env.Optional("AWS_ACCESS_KEY_ID", ""), env.Optional("AWS_SECRET_ACCESS_KEY", ""),
		env.Optional("AWS_REGION", "ap-northeast-1"), env.Optional("FROM_EMAIL", "noreply@taramanji.com"), nil,
	)
	handlers := di.NewHandlers(usecase.NewNotificationUsecase(service.NewEmailService(mailer), metrics))

	if err := server.Run(serviceName, func(mux *http.ServeMux) {
		handlers.Register(mux)
	}); err != nil {
		log.Fatal(err)
	}
}
