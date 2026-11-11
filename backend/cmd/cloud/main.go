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
	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/storage"
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

	// 同じイメージを役割ごとに動かす: コンソールの API（既定）・関数と CDN のデータプレーン（gateway）・オブジェクトストレージ（storage）
	switch env.Optional("CLOUD_MODE", "api") {
	case "gateway":
		runGateway()
		return
	case "storage":
		runStorage()
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
	hostSuffix := env.Required("HOST_SUFFIX")
	// オブジェクトストレージ（cloud-storage）。マスターキーがなければバケットの中身は扱えない
	var objects gateway.ObjectStore
	if key := env.Optional("STORAGE_MASTER_KEY", ""); key != "" {
		if objects, err = infragw.NewObjectStore(env.Optional("STORAGE_URL", "http://cloud-storage:8080"), storage.Token([]byte(key), "*")); err != nil {
			log.Fatal(err)
		}
	}
	// 公開ホスト名の DNS の自動登録（Cloudflare）。トークンがなければ手で登録する
	var dns gateway.DNS
	if token := env.Optional("CF_DNS_API_TOKEN", ""); token != "" {
		if dns, err = infragw.NewCloudflareDNS(infragw.CloudflareDNSConfig{Token: token, ZoneID: env.Required("CF_ZONE_ID"),
			TunnelID: env.Required("CF_TUNNEL_ID"), HostSuffix: hostSuffix}); err != nil {
			log.Fatal(err)
		}
	}

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
		APITarget:   service.APITarget{HostSuffix: hostSuffix, InvokerNamespace: namespace},
		Objects:     objects,
		DNS:         dns,
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
		if objects != nil {
			mux.Handle("/_objects/{bucket}/{key...}", verifier.Middleware(objectHandler(objects)))
		}
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
	// バケットを元にした CDN が読む、ストレージの読むだけのポート
	storageURL, err := url.Parse(env.Optional("STORAGE_PUBLIC_URL", "http://cloud-storage:8081"))
	if err != nil {
		log.Fatal(err)
	}
	inv := invoker.New(invoker.Config{
		StorageURL: storageURL,
		Scaler:     kube,
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
		if b := r.Header.Get(service.HeaderBucket); service.ValidName(b) {
			return "bucket " + b
		}
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

// objectHandler はコンソールからのアップロード（PUT）とダウンロード（GET）を、ストレージにそのまま渡す。
// ダウンロードは必ずファイルとして保存させる（アップロードした HTML が、コンソールのオリジンでスクリプトとして動かないように）
func objectHandler(objects gateway.ObjectStore) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		bucket, key := r.PathValue("bucket"), r.PathValue("key")
		if !service.ValidName(bucket) || !storage.ValidKey(key) {
			http.Error(w, "invalid bucket or key", http.StatusBadRequest)
			return
		}
		switch r.Method {
		case http.MethodGet, http.MethodHead:
			w.Header().Set("Content-Disposition", "attachment")
			w.Header().Set("Content-Security-Policy", "sandbox")
		case http.MethodPut:
		default:
			w.Header().Set("Allow", "GET, HEAD, PUT")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		objects.Proxy(w, r, bucket, key)
	})
}

const storageServiceName = "cloud-storage"

// runStorage はオブジェクトストレージ。読み書き（トークンが要る）を PORT で、読むだけ（CDN 用）を STORAGE_PUBLIC_PORT で開く。
// バケットは、アプリ用 namespace の ConfigMap（ラベル cloud.taramanji.com/bucket）に合わせて作る
func runStorage() {
	kube, err := infragw.NewInClusterKube(env.Required("POD_NAMESPACE"), env.Required("APPS_NAMESPACE"))
	if err != nil {
		log.Fatal(err)
	}
	store, err := storage.New(env.Optional("STORAGE_DIR", "/data"), []byte(env.Required("STORAGE_MASTER_KEY")))
	if err != nil {
		log.Fatal(err)
	}
	reconcile := func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		names, err := kube.LabeledConfigMaps(ctx, service.LabelBucket)
		if err == nil {
			err = store.Reconcile(names)
		}
		if err != nil {
			logger.L().Warn("bucket reconcile failed", "error", err)
		}
	}
	reconcile()
	go func() {
		for range time.Tick(15 * time.Second) {
			reconcile()
		}
	}()
	go func() {
		srv := &http.Server{Addr: env.Optional("STORAGE_PUBLIC_PORT", ":8081"), Handler: store.PublicHandler(), ReadHeaderTimeout: 10 * time.Second}
		log.Fatal(srv.ListenAndServe())
	}()
	// キーは利用者しだいなので、APM のリソース名はメソッドだけにする
	name := func(r *http.Request) string { return r.Method + " object" }
	if err := server.RunNamed(storageServiceName, name, func(mux *http.ServeMux) { mux.Handle("/b/", store.Handler()) }); err != nil {
		log.Fatal(err)
	}
}
