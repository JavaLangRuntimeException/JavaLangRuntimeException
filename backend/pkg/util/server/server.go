// Package server は各サービス共通の HTTP/2（h2c）サーバー。
// 1 ポートで Connect・gRPC・gRPC-Web と通常の HTTP（ヘルスチェック・OAuth コールバック等）を受ける。
package server

import (
	"context"
	"errors"
	"net"
	"net/http"
	"os"
	"os/signal"
	"sync/atomic"
	"syscall"
	"time"

	"connectrpc.com/connect"
	httptrace "github.com/DataDog/dd-trace-go/contrib/net/http/v2"

	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/env"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/logger"
)

// Run は mux にヘルスチェックを足して起動し、SIGTERM で行儀よく止める
func Run(service string, mount func(mux *http.ServeMux)) error {
	mux := http.NewServeMux()
	var ready atomic.Bool
	ready.Store(true)
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, _ *http.Request) {
		if !ready.Load() {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusOK)
	})
	mount(mux)

	// APM: リソース名は「メソッド + パス」（Connect なら /パッケージ.サービス/RPC 名）
	handler := httptrace.WrapHandler(mux, service, "", httptrace.WithResourceNamer(func(r *http.Request) string {
		return r.Method + " " + r.URL.Path
	}))

	protocols := new(http.Protocols)
	protocols.SetHTTP1(true)
	protocols.SetUnencryptedHTTP2(true)
	srv := &http.Server{
		Addr:              env.Port(),
		Handler:           handler,
		Protocols:         protocols,
		ReadHeaderTimeout: 10 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, os.Interrupt)
	defer stop()
	errCh := make(chan error, 1)
	go func() {
		logger.L().Info("listening", "addr", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()
	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
	}
	// readiness を落としてから少し待ち、Gateway が新しいリクエストを送らなくなってから止める
	ready.Store(false)
	time.Sleep(5 * time.Second)
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	return srv.Shutdown(shutdownCtx)
}

// internalHTTPClient はクラスター内の gRPC（h2c）用。APM でトレースを呼び出し先へ引き継ぐ
func internalHTTPClient() *http.Client {
	protocols := new(http.Protocols)
	protocols.SetUnencryptedHTTP2(true)
	return httptrace.WrapClient(&http.Client{
		Timeout: 30 * time.Second,
		Transport: &http.Transport{
			Protocols:   protocols,
			DialContext: (&net.Dialer{Timeout: 5 * time.Second}).DialContext,
		},
	})
}

// InternalClientOptions はサービス間通信（gRPC プロトコル）のクライアント設定
func InternalClientOptions() []connect.ClientOption {
	return []connect.ClientOption{connect.WithGRPC()}
}

// InternalHTTPClient はサービス間通信用の HTTP クライアント
func InternalHTTPClient() *http.Client { return internalHTTPClient() }
