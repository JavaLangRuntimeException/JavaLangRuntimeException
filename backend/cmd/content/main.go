// content は外部の公開情報（Qiita・connpass・ORCID・OGP）を返すマイクロサービス。
package main

import (
	"log"
	"net/http"

	"github.com/javalangruntimeexception/taramanji/backend/internal/content/di"
	"github.com/javalangruntimeexception/taramanji/backend/internal/content/domain/service"
	"github.com/javalangruntimeexception/taramanji/backend/internal/content/infra/cache"
	infragw "github.com/javalangruntimeexception/taramanji/backend/internal/content/infra/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/content/usecase"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/env"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/logger"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/observability"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/redisx"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/server"
)

const serviceName = "content"

func main() {
	logger.Init()
	metrics, stop := observability.Init(serviceName)
	defer stop()

	rdb, err := redisx.New(serviceName)
	if err != nil {
		log.Fatal(err)
	}
	svc := service.NewContentService(
		infragw.NewQiita(env.Optional("QIITA_TOKEN", "")),
		infragw.NewConnpass(), infragw.NewOrcid(), infragw.NewOgpFetcher(),
		cache.NewRedisCache(rdb), nil,
	)
	handlers := di.NewHandlers(usecase.NewContentUsecase(svc, metrics))

	if err := server.Run(serviceName, func(mux *http.ServeMux) {
		handlers.Register(mux)
	}); err != nil {
		log.Fatal(err)
	}
}
