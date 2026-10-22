// cloud は taramanji cloud（個人用の小さなクラウド）のマネジメントコンソールの API。
// cloud.taramanji.com の Cloudflare Access の JWT だけを信じ、taramanji.com のセッション（AUTH_SECRET）は持たない。
package main

import (
	"log"
	"net/http"
	"strings"

	"connectrpc.com/connect"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/di"
	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/service"
	infragw "github.com/javalangruntimeexception/taramanji/backend/internal/cloud/infra/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/usecase"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/cfaccess"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/env"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/logger"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/observability"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/server"
)

const serviceName = "cloud-api"

func main() {
	logger.Init()
	_, stop := observability.Init(serviceName)
	defer stop()

	verifier, err := cfaccess.New(cfaccess.Config{
		TeamDomain: env.Required("CF_ACCESS_TEAM_DOMAIN"),
		AUD:        env.Required("CF_ACCESS_AUD"),
		Email:      env.Required("ADMIN_EMAIL"),
		Origins:    []string{env.Required("CONSOLE_ORIGIN")},
	})
	if err != nil {
		log.Fatal(err)
	}
	namespace := env.Required("POD_NAMESPACE")
	cluster, err := infragw.NewInClusterKube(namespace)
	if err != nil {
		log.Fatal(err)
	}
	// メトリクスは本番だけ（キーを渡したときだけ）。dev / stg は Datadog が集めていない
	var metrics gateway.Metrics
	if key := env.Optional("DD_METRICS_API_KEY", ""); key != "" {
		metrics = infragw.NewDatadog(env.Optional("DD_METRICS_SITE", "https://api.us5.datadoghq.com"), key, env.Required("DD_METRICS_APP_KEY"))
	}

	uc := usecase.NewConsoleUsecase(usecase.Deps{
		Environment:       env.Required("CLOUD_ENV"),
		StorageHostSuffix: env.Required("STORAGE_HOST_SUFFIX"),
		HostingHostSuffix: env.Required("HOSTING_HOST_SUFFIX"),
		Cluster:           cluster,
		Metrics:           metrics,
		MetricsScope: service.MetricsScope{
			Cluster:     env.Optional("METRICS_CLUSTER", "taramanji-kind"),
			Namespaces:  strings.Split(env.Optional("METRICS_NAMESPACES", namespace), ","),
			Gateway:     "cloud",
			APMEnv:      env.Optional("DD_ENV", "prod"),
			APMServices: []string{serviceName},
		},
	})
	handlers := di.NewHandlers(uc)
	if err := server.Run(serviceName, func(mux *http.ServeMux) {
		handlers.Register(mux, connect.WithInterceptors(verifier.Interceptor()))
	}); err != nil {
		log.Fatal(err)
	}
}
