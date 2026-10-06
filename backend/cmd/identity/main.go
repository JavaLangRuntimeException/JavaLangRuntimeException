// identity は管理者ログイン（Google OpenID Connect）とセッションのマイクロサービス。
// セッションは AUTH_SECRET で署名した JWT の Cookie で、各サービスは同じ鍵で検証する。
package main

import (
	"log"
	"net/http"

	"connectrpc.com/connect"

	"github.com/javalangruntimeexception/taramanji/backend/internal/identity/di"
	"github.com/javalangruntimeexception/taramanji/backend/internal/identity/domain/service"
	"github.com/javalangruntimeexception/taramanji/backend/internal/identity/handler"
	infragw "github.com/javalangruntimeexception/taramanji/backend/internal/identity/infra/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/identity/usecase"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/auth"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/env"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/logger"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/observability"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/server"
)

const serviceName = "identity"

func main() {
	logger.Init()
	metrics, stop := observability.Init(serviceName)
	defer stop()

	// ログインを受けるホスト（各ホストの /api/auth/callback/google を Google に登録しておく）
	hosts := service.ParseHosts(env.Optional("LOGIN_HOSTS", "taramanji.com,www.taramanji.com,gws.taramanji.com"))
	uc := usecase.NewIdentityUsecase(infragw.NewGoogleOIDC(env.Required("GOOGLE_CLIENT_ID"), env.Required("GOOGLE_CLIENT_SECRET")),
		hosts, metrics, nil)
	handlers := di.NewHandlers(uc)
	authHTTP := handler.NewAuthHandlers(uc, env.AppEnv() != "local")

	if err := server.Run(serviceName, func(mux *http.ServeMux) {
		handlers.Register(mux, connect.WithInterceptors(auth.SessionInterceptor()))
		authHTTP.Register(mux)
	}); err != nil {
		log.Fatal(err)
	}
}
