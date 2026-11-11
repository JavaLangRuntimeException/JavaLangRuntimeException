// cloud は taramanji cloud（個人用の小さなクラウド）のマネジメントコンソールの API。
// cloud.taramanji.com の Cloudflare Access の JWT だけを信じ、taramanji.com のセッション（AUTH_SECRET）は持たない。
package main

import (
	"context"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"connectrpc.com/connect"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/argoview"
	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/controller"
	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/deployer"
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

	// 同じイメージを役割ごとに動かす: コンソールの API（既定）・関数と CDN のデータプレーン（gateway）・
	// オブジェクトストレージ（storage）・データベースと接続先のコントローラー（controller）
	switch env.Optional("CLOUD_MODE", "api") {
	case "gateway":
		runGateway()
		return
	case "storage":
		runStorage()
		return
	case "controller":
		runController()
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
	kube.WithFunctions(env.Required("CLOUD_ENV"), functionCaps())
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
	if key := secretEnv("STORAGE_MASTER_KEY", false); key != "" {
		if objects, err = infragw.NewObjectStore(env.Optional("STORAGE_URL", "http://cloud-storage:8080"), storage.Token([]byte(key), "*")); err != nil {
			log.Fatal(err)
		}
	}
	// CDN の独自ドメインに使えるゾーン（本番だけ。taramanji.com）
	aliasZone := env.Optional("CUSTOM_DOMAIN_ZONE", "")
	// 公開ホスト名の DNS の自動登録（Cloudflare）。トークンがなければ手で登録する
	var dns gateway.DNS
	if token := env.Optional("CF_DNS_API_TOKEN", ""); token != "" {
		if dns, err = infragw.NewCloudflareDNS(infragw.CloudflareDNSConfig{Token: token, ZoneID: env.Required("CF_ZONE_ID"),
			TunnelID: env.Required("CF_TUNNEL_ID"), HostSuffix: hostSuffix, AliasZone: aliasZone}); err != nil {
			log.Fatal(err)
		}
	}
	// CDN の独自ドメインを Cloudflare Access で守る（Access: Apps and Policies の編集のトークン）。なければ独自ドメインは足せない
	var access gateway.AccessHosts
	if token := secretEnv("CF_ACCESS_API_TOKEN", false); token != "" && aliasZone != "" {
		if access, err = infragw.NewCloudflareAccess(infragw.CloudflareAccessConfig{Token: token, AccountID: env.Required("CF_ACCOUNT_ID")}); err != nil {
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
		APITarget: service.APITarget{HostSuffix: hostSuffix, InvokerNamespace: namespace, AliasZone: aliasZone},
		Objects:   objects,
		State:     kube,
		// 共有の PostgreSQL / Redis とコントローラー（cloud-ctl）を、この環境に入れてあるか
		DatabasesEnabled: env.Optional("DATABASES_ENABLED", "") == "true",
		DNS:              dns,
		Access:           access,
		IdleTimeout:      idleTimeout(),
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
	cloudEnv, caps := env.Required("CLOUD_ENV"), functionCaps()
	kube.WithFunctions(cloudEnv, caps)
	idle := idleTimeout()
	// バケットを元にした CDN が読む、ストレージの読むだけのポート
	storageURL, err := url.Parse(env.Optional("STORAGE_PUBLIC_URL", "http://cloud-storage:8081"))
	if err != nil {
		log.Fatal(err)
	}
	gatewayURL, err := url.Parse(env.Optional("GATEWAY_URL", "http://taramanji-cloud-gateway.envoy-gateway-system.svc.cluster.local"))
	if err != nil || gatewayURL.Host == "" {
		log.Fatal("GATEWAY_URL must be a URL")
	}
	apiTarget := service.APITarget{HostSuffix: env.Required("HOST_SUFFIX")}
	inv := invoker.New(invoker.Config{
		StorageURL: storageURL,
		Scaler:     kube,
		// 関数は自分の namespace（taramanji-cloud-fn-<名前> など）の、関数と同じ名前の Service
		Upstream: func(name string) *url.URL {
			return &url.URL{Scheme: "http", Host: name + "." + service.FunctionNamespace(cloudEnv, name) + ".svc.cluster.local"}
		},
		MemoryCap:        caps.MemoryBytes,
		IdleTimeout:      idle,
		ColdStartTimeout: 60 * time.Second,
		Log:              logger.L(),
		// CDN の元が API のとき、その API のホスト名で cloud の Envoy に渡し直す
		GatewayURL: gatewayURL,
		APIHost:    func(name string) string { return apiTarget.Host(service.HostAPI, name) },
		// CDN（ログイン済み）から API に渡し直したリクエストの署名の鍵。なければ署名せず、API キーを求める
		InternalSecret: []byte(secretEnv("GATEWAY_INTERNAL_SECRET", false)),
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
	// ログインなしの入口（*-apigw-cloud・*-storage-cloud）を大量に叩かれても、関数と Mac mini を守る。利用者（IP）ごとに、
	// 1 秒に GATEWAY_RATE_PER_SEC 回（既定 20）・続けて GATEWAY_RATE_BURST 回（既定 60）まで。Pod ごとに数える（2 台なら最大で 2 倍）
	perSec, burst := envInt("GATEWAY_RATE_PER_SEC", 20), envInt("GATEWAY_RATE_BURST", 60)
	handler := invoker.Limit(invoker.RateLimit{PerSecond: perSec, Burst: burst}, inv, inv.FromCDN)
	if err := server.RunNamed(gatewayServiceName, name, func(mux *http.ServeMux) { mux.Handle("/", handler) }); err != nil {
		log.Fatal(err)
	}
}

// envInt は正の整数の環境変数（なければ def）
func envInt(name string, def int) int {
	v, err := strconv.Atoi(env.Optional(name, strconv.Itoa(def)))
	if err != nil || v <= 0 {
		log.Fatalf("%s must be a positive integer", name)
	}
	return v
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
	store, err := storage.New(env.Optional("STORAGE_DIR", "/data"), []byte(secretEnv("STORAGE_MASTER_KEY", true)))
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

const controllerServiceName = "cloud-ctl"

// runController はコントローラー。データベース・バケットの定義（アプリ用 namespace の ConfigMap）に合わせて、
// 共有の PostgreSQL / Redis からデータベースを切り出し、接続先の Secret を作る
func runController() {
	namespace := env.Required("POD_NAMESPACE")
	kube, err := infragw.NewInClusterKube(namespace, env.Required("APPS_NAMESPACE"))
	if err != nil {
		log.Fatal(err)
	}
	svc := func(name string) string { return name + "." + namespace + ".svc.cluster.local" }
	pg, err := infragw.NewPostgresEngine((&url.URL{Scheme: "postgres", User: url.UserPassword("postgres", secretEnv("POSTGRES_ADMIN_PASSWORD", true)),
		Host: svc("cloud-postgres") + ":5432", Path: "/postgres", RawQuery: "sslmode=disable"}).String())
	if err != nil {
		log.Fatal(err)
	}
	ctl := controller.New(controller.Config{
		Cluster:   kube,
		MasterKey: []byte(secretEnv("STORAGE_MASTER_KEY", true)),
		Engines: map[string]gateway.DatabaseEngine{
			service.EnginePostgres: pg,
			service.EngineRedis:    infragw.NewRedisEngine(svc("cloud-redis")+":6379", secretEnv("REDIS_ADMIN_PASSWORD", true)),
		},
		Endpoints: map[string]controller.Endpoint{
			service.EnginePostgres: {Host: svc("cloud-postgres"), Port: 5432},
			service.EngineRedis:    {Host: svc("cloud-redis"), Port: 6379},
		},
		StorageURL: "http://" + svc("cloud-storage") + ":8080",
		// 非公開のイメージ（GHCR・Docker Hub）を読む認証情報。なければ公開のイメージだけ
		PullSecret:       secretEnv("REGISTRY_DOCKERCONFIG", false),
		Env:              env.Required("CLOUD_ENV"),
		Registry:         env.Required("APPS_NAMESPACE"),
		ConsoleNamespace: namespace,
		Log:              logger.L(),
	})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	cloudEnv, registry := env.Required("CLOUD_ENV"), env.Required("APPS_NAMESPACE")
	// デプロイヤー: アプリ用のリポジトリの YAML を、Argo CD を使わずに入れる。トークンがなければ、コントローラーだけ動かす
	if token, repo := secretEnv("APPS_REPO_TOKEN", false), env.Optional("APPS_REPO", ""); token != "" && repo != "" {
		src, err := infragw.NewGitHubResourceStore(infragw.GitHubConfig{Repo: repo, Branch: env.Optional("APPS_REPO_BRANCH", "main"), Dir: cloudEnv, Token: token})
		if err != nil {
			log.Fatal(err)
		}
		dep := deployer.New(deployer.Config{
			Source: src, Applier: kube, Env: cloudEnv, Registry: registry,
			Target:    service.APITarget{HostSuffix: env.Required("HOST_SUFFIX"), InvokerNamespace: namespace, AliasZone: env.Optional("CUSTOM_DOMAIN_ZONE", "")},
			Reconcile: ctl.Reconcile,
			Log:       logger.L(),
		})
		// 前の様子（再起動の前に書いたもの）を読み戻して、履歴を続ける
		if cms, err := kube.ConfigMaps(ctx, service.LabelDeployStatus); err == nil {
			for _, cm := range cms {
				if cm.Name == service.DeployStatusConfigMap {
					dep.LoadStatuses(cm.Data)
				}
			}
		}
		go dep.Run(ctx, 15*time.Second)
	} else {
		go ctl.Run(ctx, 20*time.Second)
	}
	// Argo CD の画面で関数の Pod を見るため、ApplicationSet の plugin ジェネレーターに関数の名前を返す（トークンがあるときだけ。本番だけ）
	pluginToken := secretEnv("ARGOCD_PLUGIN_TOKEN", false)
	if err := server.Run(controllerServiceName, func(mux *http.ServeMux) {
		if pluginToken == "" {
			return
		}
		mux.Handle(argoview.Path, argoview.Handler(pluginToken, func(ctx context.Context) ([]string, error) {
			cms, err := kube.ConfigMaps(ctx, service.LabelFunction)
			if err != nil {
				return nil, err
			}
			names := make([]string, 0, len(cms))
			for _, cm := range cms {
				if n := cm.Labels[service.LabelFunction]; service.ValidName(n) && cm.Name == service.FunctionRegistrationName(n) {
					names = append(names, n)
				}
			}
			return names, nil
		}))
	}); err != nil {
		log.Fatal(err)
	}
}

// secretEnv は Secret から入る値を読み、前後の空白と改行を落とす（seal.sh がファイルから作るので、末尾に改行が付く）。
// PostgreSQL は初期化のときにパスワードの改行を落とすので、そろえないとつなげない
func secretEnv(key string, required bool) string {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" && required {
		log.Fatalf("%s is not set", key)
	}
	return v
}

// functionCaps は環境の関数の合計の枠（本番 2.5 GiB など）。関数は namespace ごとに分かれているので、
// API Gateway が関数を起こすときにこの枠で確かめ、コンソールの「容量」もこの枠で数える
func functionCaps() gateway.Resources {
	num := func(key, def string) int64 {
		v, err := strconv.ParseInt(env.Optional(key, def), 10, 64)
		if err != nil || v < 0 {
			log.Fatalf("%s must be a non-negative integer", key)
		}
		return v
	}
	return gateway.Resources{MemoryBytes: num("FUNCTION_MEMORY_CAP_MIB", "512") << 20, CPUMillis: num("FUNCTION_CPU_CAP_MILLIS", "1000"), Pods: num("FUNCTION_POD_CAP", "10")}
}
