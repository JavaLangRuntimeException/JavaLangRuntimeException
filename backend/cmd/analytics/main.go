// analytics はアクセス数（ページビュー）を Datadog に送るマイクロサービス。
// ブラウザの navigator.sendBeacon が JSON を送るため、RPC ではなく HTTP で受ける。
package main

import (
	"log"

	"github.com/javalangruntimeexception/taramanji/backend/internal/analytics/handler"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/logger"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/observability"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/server"
)

const serviceName = "analytics"

func main() {
	logger.Init()
	metrics, stop := observability.Init(serviceName)
	defer stop()

	pageviews := handler.NewPageviewHandler(metrics)
	if err := server.Run(serviceName, pageviews.Register); err != nil {
		log.Fatal(err)
	}
}
