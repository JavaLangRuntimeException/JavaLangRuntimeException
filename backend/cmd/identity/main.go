// identity は管理者ログイン（Cloudflare Access）とセッションのマイクロサービス。
// セッションは AUTH_SECRET で署名した JWT の Cookie で、各サービスは同じ鍵で検証する。
package main

import (
	"log"
	"net/http"

	"connectrpc.com/connect"

	"github.com/javalangruntimeexception/taramanji/backend/internal/identity/di"
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

	// ログインは Cloudflare Access だけ。Access のトークンを検証してセッションに替える
	// （CF_ACCESS_AUD は、その環境の /admin を守る Access アプリの AUD。カンマ区切りで複数）
	access, err := infragw.NewCloudflareAccess(env.Required("CF_ACCESS_TEAM_DOMAIN"), env.Required("CF_ACCESS_AUD"))
	if err != nil {
		log.Fatal(err)
	}
	uc := usecase.NewIdentityUsecase(access, metrics, nil)
	handlers := di.NewHandlers(uc)
	authHTTP := handler.NewAuthHandlers(uc, env.AppEnv() != "local")

	if err := server.Run(serviceName, func(mux *http.ServeMux) {
		handlers.Register(mux, connect.WithInterceptors(auth.SessionInterceptor()))
		authHTTP.Register(mux)
	}); err != nil {
		log.Fatal(err)
	}
}
