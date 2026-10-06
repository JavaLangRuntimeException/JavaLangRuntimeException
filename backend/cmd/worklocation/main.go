// worklocation は勤務場所のマイクロサービス（公開: 一覧、管理者: 登録・削除、内部 gRPC: 1 日分の取得）。
package main

import (
	"log"
	"net/http"

	"connectrpc.com/connect"

	"github.com/javalangruntimeexception/taramanji/backend/gen/taramanji/worklocation/v1/worklocationv1connect"
	"github.com/javalangruntimeexception/taramanji/backend/internal/worklocation/di"
	"github.com/javalangruntimeexception/taramanji/backend/internal/worklocation/domain/service"
	infrarepo "github.com/javalangruntimeexception/taramanji/backend/internal/worklocation/infra/repository"
	"github.com/javalangruntimeexception/taramanji/backend/internal/worklocation/usecase"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/auth"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/logger"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/observability"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/redisx"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/server"
)

const serviceName = "worklocation"

func main() {
	logger.Init()
	_, stop := observability.Init(serviceName)
	defer stop()

	rdb, err := redisx.New(serviceName)
	if err != nil {
		log.Fatal(err)
	}
	svc := service.NewWorkLocationService(infrarepo.NewRedisWorkLocationRepository(rdb), nil)
	handlers := di.NewHandlers(usecase.NewWorkLocationUsecase(svc))

	adminOnly := auth.AdminInterceptor([]string{
		worklocationv1connect.WorkLocationServiceSetWorkLocationsProcedure,
		worklocationv1connect.WorkLocationServiceDeleteWorkLocationProcedure,
	}, nil, "")

	if err := server.Run(serviceName, func(mux *http.ServeMux) {
		handlers.Register(mux, connect.WithInterceptors(adminOnly))
	}); err != nil {
		log.Fatal(err)
	}
}
