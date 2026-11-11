// cloud は taramanji cloud（個人用の小さなクラウド）のマネジメントコンソールの API。
// cloud.taramanji.com の Cloudflare Access の JWT だけを信じ、taramanji.com のセッション（AUTH_SECRET）は持たない。
package main

import (
	"context"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"connectrpc.com/connect"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/di"
	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/service"
	infragw "github.com/javalangruntimeexception/taramanji/backend/internal/cloud/infra/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/invoker"
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

	// 同じイメージを 2 つの役割で動かす: コンソールの API（既定）と、関数を呼び出す API Gateway（CLOUD_MODE=gateway）
	if env.Optional("CLOUD_MODE", "api") == "gateway" {
		runGateway()
		return
	}

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
	kube, err := infragw.NewInClusterKube(namespace, env.Required("APPS_NAMESPACE"))
	if err != nil {
		log.Fatal(err)
	}
	reserveMiB, err := strconv.Atoi(env.Optional("CAPACITY_RESERVE_MIB", "2048"))
	if err != nil || reserveMiB < 0 {
		log.Fatal("CAPACITY_RESERVE_MIB must be a non-negative integer")
	}
	// メトリクスは本番だけ（キーを渡したときだけ）。dev / stg は Datadog が集めていない
	var metrics gateway.Metrics
	var monitors gateway.Monitors
	if key := env.Optional("DD_METRICS_API_KEY", ""); key != "" {
		site, appKey := env.Optional("DD_METRICS_SITE", "https://api.us5.datadoghq.com"), env.Required("DD_METRICS_APP_KEY")
		metrics = infragw.NewDatadog(site, key, appKey)
		// アプリの監視（Datadog のモニター）。アプリケーションキーに monitors_read・monitors_write を足したときだけ有効にする
		if env.Optional("ALERTS_ENABLED", "") == "true" {
			monitors = infragw.NewDatadogMonitors(site, key, appKey)
		}
	}
	cloudEnv := env.Required("CLOUD_ENV")
	// アプリの YAML の置き場（アプリ専用のリポジトリ）。トークンがなければホスティングは使えない（容量・メトリクスは動く）
	var apps gateway.ResourceStore
	appsRepo := env.Optional("APPS_REPO", "")
	if token := env.Optional("APPS_REPO_TOKEN", ""); token != "" && appsRepo != "" {
		if apps, err = infragw.NewGitHubResourceStore(infragw.GitHubConfig{Repo: appsRepo, Branch: env.Optional("APPS_REPO_BRANCH", "main"), Dir: cloudEnv, Token: token}); err != nil {
			log.Fatal(err)
		}
	}
	cluster := env.Optional("METRICS_CLUSTER", "taramanji-kind")

	uc := usecase.NewConsoleUsecase(usecase.Deps{
		Environment: cloudEnv,
		Cluster:     kube,
		Capacity:    kube,
		// taramanji.com・gws の伸びしろ（既定 2 GiB）。アプリの「あと何個」はこれを除いた空きで数える
		MemoryReserve:  int64(reserveMiB) << 20,
		Metrics:        metrics,
		Apps:           apps,
		AppsRepository: appsRepo,
		Monitors:       monitors,
		AlertScope: service.AlertScope{Environment: cloudEnv, Cluster: cluster, Namespace: env.Required("APPS_NAMESPACE"),
			APMEnv: env.Optional("DD_ENV", "prod"), InvokerService: gatewayServiceName},
		APITarget:   service.APITarget{HostSuffix: env.Required("HOST_SUFFIX"), InvokerNamespace: namespace},
		IdleTimeout: idleTimeout(),
		MetricsScope: service.MetricsScope{
			Cluster:     cluster,
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

const gatewayServiceName = "cloud-gw"

// runGateway は API Gateway（データプレーン）。cloud の Envoy から来たリクエストを関数に渡し、
// 0 台なら起こし、しばらく来なければ 0 台に戻す。利用者の認証はしない（公開する API をそのまま通す）
func runGateway() {
	appsNamespace := env.Required("APPS_NAMESPACE")
	kube, err := infragw.NewInClusterKube(env.Required("POD_NAMESPACE"), appsNamespace)
	if err != nil {
		log.Fatal(err)
	}
	idle := idleTimeout()
	inv := invoker.New(invoker.Config{
		Scaler: kube,
		Upstream: func(name string) *url.URL {
			return &url.URL{Scheme: "http", Host: name + "." + appsNamespace + ".svc.cluster.local"}
		},
		IdleTimeout:      idle,
		ColdStartTimeout: 60 * time.Second,
		Log:              logger.L(),
	})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go inv.Run(ctx, 30*time.Second)
	// パスは関数しだいなので、APM のリソース名は関数名にする
	name := func(r *http.Request) string {
		if fn := r.Header.Get(service.HeaderFunction); service.ValidName(fn) {
			return fn
		}
		return "unrouted"
	}
	if err := server.RunNamed(gatewayServiceName, name, func(mux *http.ServeMux) { mux.Handle("/", inv) }); err != nil {
		log.Fatal(err)
	}
}

// idleTimeout はリクエストが来なくなってから関数を 0 台に戻すまでの時間（コンソールの表示と API Gateway で同じ値を使う）
func idleTimeout() time.Duration {
	idle, err := time.ParseDuration(env.Optional("FUNCTION_IDLE_TIMEOUT", "5m"))
	if err != nil || idle < time.Minute {
		log.Fatal("FUNCTION_IDLE_TIMEOUT must be a duration of at least 1m")
	}
	return idle
}
