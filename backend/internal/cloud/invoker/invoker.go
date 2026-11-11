// Package invoker は taramanji cloud の API Gateway（データプレーン）。
// Envoy から来たリクエストを関数（アプリ用 namespace の Deployment）に渡す。関数が 0 台なら 1 台に起こして待ち、
// しばらくリクエストが来なければ 0 台に戻す（Lambda のように、使うときだけ動く）。
//
// どの関数に渡すかは Envoy が付ける X-Cloud-Function で決まる（API の HTTPRoute の RequestHeaderModifier が上書きするので、
// 利用者は偽れない。この Pod は NetworkPolicy で cloud の Envoy からしか受けない）
package invoker

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"
	"sync"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/service"
)

type Config struct {
	Scaler gateway.FunctionScaler
	// Upstream は関数名 → 送り先（http://<名前>.<namespace>.svc.cluster.local）
	Upstream func(name string) *url.URL
	// IdleTimeout だけリクエストが来なければ 0 台に戻す
	IdleTimeout time.Duration
	// ColdStartTimeout は起こしてから応答できるようになるまで待つ上限
	ColdStartTimeout time.Duration
	Clock            func() time.Time
	Log              *slog.Logger
	// Transport はテストで差し替える
	Transport http.RoundTripper
}

const (
	// 最後のリクエストの時刻を Deployment に書く間隔（毎回は書かない）
	touchEvery = time.Minute
	// 起動を待つあいだの確認の間隔
	pollEvery = 250 * time.Millisecond
	// 起きた直後は Service にまだ Pod が載っていないことがある。つながらなければ少し待ってやり直す
	dialRetries = 8
	dialBackoff = 250 * time.Millisecond
)

type fnState struct {
	inflight  int
	lastSeen  time.Time
	lastTouch time.Time
	// ready は起きているとわかっている（0 台に戻したら false）
	ready bool
	// waking は起こしている最中。終わると閉じる
	waking chan struct{}
	err    error
}

type Invoker struct {
	c   Config
	mu  sync.Mutex
	fns map[string]*fnState
}

func New(c Config) *Invoker {
	if c.Clock == nil {
		c.Clock = time.Now
	}
	if c.Log == nil {
		c.Log = slog.Default()
	}
	if c.Transport == nil {
		c.Transport = &http.Transport{MaxIdleConnsPerHost: 16, IdleConnTimeout: 30 * time.Second, ResponseHeaderTimeout: 60 * time.Second}
	}
	return &Invoker{c: c, fns: map[string]*fnState{}}
}

func (i *Invoker) state(name string) *fnState {
	s, ok := i.fns[name]
	if !ok {
		s = &fnState{}
		i.fns[name] = s
	}
	return s
}

func (i *Invoker) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	name := r.Header.Get(service.HeaderFunction)
	if !service.ValidAppName(name) {
		// API（HTTPRoute）を通っていない
		http.Error(w, "no function is routed for this request", http.StatusNotFound)
		return
	}
	now := i.c.Clock()
	i.mu.Lock()
	s := i.state(name)
	s.inflight++
	s.lastSeen = now
	touch := now.Sub(s.lastTouch) >= touchEvery
	if touch {
		s.lastTouch = now
	}
	i.mu.Unlock()
	defer func() {
		i.mu.Lock()
		s.inflight--
		s.lastSeen = i.c.Clock()
		i.mu.Unlock()
	}()
	if touch {
		// ほかの API Gateway の Pod が、使われている関数を寝かせないように知らせる。失敗しても呼び出しは続ける
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			if err := i.c.Scaler.Touch(ctx, name, now); err != nil && !errors.Is(err, gateway.ErrFunctionNotFound) {
				i.c.Log.Warn("touch failed", "function", name, "error", err)
			}
		}()
	}

	if err := i.wake(r.Context(), name); err != nil {
		i.fail(w, name, err)
		return
	}
	r.Header.Del(service.HeaderFunction)
	i.proxy(name).ServeHTTP(w, r)
}

func (i *Invoker) fail(w http.ResponseWriter, name string, err error) {
	switch {
	case errors.Is(err, gateway.ErrFunctionNotFound):
		http.Error(w, "function not found", http.StatusNotFound)
	case errors.Is(err, context.Canceled):
		// 利用者が待たずに切った
	default:
		i.c.Log.Error("cold start failed", "function", name, "error", err)
		w.Header().Set("Retry-After", "5")
		http.Error(w, "function is not ready", http.StatusServiceUnavailable)
	}
}

// wake は関数が応答できる状態になるまで待つ。0 台なら 1 台にする。同じ関数を同時に起こすのは 1 回だけ
func (i *Invoker) wake(ctx context.Context, name string) error {
	i.mu.Lock()
	s := i.state(name)
	if s.ready {
		i.mu.Unlock()
		return nil
	}
	if s.waking == nil {
		s.waking = make(chan struct{})
		go i.doWake(name, s)
	}
	ch := s.waking
	i.mu.Unlock()
	select {
	case <-ch:
		i.mu.Lock()
		defer i.mu.Unlock()
		return s.err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (i *Invoker) doWake(name string, s *fnState) {
	ctx, cancel := context.WithTimeout(context.Background(), i.c.ColdStartTimeout)
	defer cancel()
	err := func() error {
		st, err := i.c.Scaler.Function(ctx, name)
		if err != nil {
			return err
		}
		if st.Replicas == 0 {
			i.c.Log.Info("cold start", "function", name)
			if err := i.c.Scaler.Scale(ctx, name, 1); err != nil {
				return err
			}
		}
		for st.Ready == 0 {
			select {
			case <-ctx.Done():
				return errors.New("timed out waiting for the function to become ready")
			case <-time.After(pollEvery):
			}
			if st, err = i.c.Scaler.Function(ctx, name); err != nil {
				return err
			}
		}
		return nil
	}()
	i.mu.Lock()
	s.ready, s.err = err == nil, err
	close(s.waking)
	s.waking = nil
	i.mu.Unlock()
}

func (i *Invoker) proxy(name string) *httputil.ReverseProxy {
	target := i.c.Upstream(name)
	return &httputil.ReverseProxy{
		Rewrite: func(pr *httputil.ProxyRequest) {
			pr.SetURL(target)
			// 関数には利用者が見ているホスト名（xxx-cloud.taramanji.com）をそのまま渡す
			pr.Out.Host = pr.In.Host
			pr.SetXForwarded()
		},
		Transport: &retryDial{next: i.c.Transport},
		ErrorHandler: func(w http.ResponseWriter, _ *http.Request, err error) {
			// 寝かせた直後などで届かなかった。次のリクエストでは台数を確かめ直す
			i.mu.Lock()
			i.state(name).ready = false
			i.mu.Unlock()
			i.c.Log.Warn("upstream failed", "function", name, "error", err)
			w.Header().Set("Retry-After", "1")
			http.Error(w, "function did not respond", http.StatusBadGateway)
		},
	}
}

// retryDial は、本文のないリクエスト（GET など）がつながらなかったときだけ少し待ってやり直す
type retryDial struct{ next http.RoundTripper }

func (t *retryDial) RoundTrip(r *http.Request) (*http.Response, error) {
	res, err := t.next.RoundTrip(r)
	for n := 0; err != nil && n < dialRetries && (r.Body == nil || r.Body == http.NoBody) && r.Context().Err() == nil; n++ {
		time.Sleep(dialBackoff)
		res, err = t.next.RoundTrip(r)
	}
	return res, err
}

// Run は ctx が終わるまで、使われていない関数を 0 台に戻し続ける
func (i *Invoker) Run(ctx context.Context, every time.Duration) {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if err := i.Sweep(ctx); err != nil {
				i.c.Log.Warn("idle sweep failed", "error", err)
			}
		}
	}
}

// Sweep は動いている関数のうち、IdleTimeout のあいだどの Pod にもリクエストが来ていないものを 0 台に戻す
func (i *Invoker) Sweep(ctx context.Context) error {
	running, err := i.c.Scaler.Running(ctx)
	if err != nil {
		return err
	}
	now := i.c.Clock()
	for _, f := range running {
		i.mu.Lock()
		s := i.state(f.Name)
		if s.lastSeen.IsZero() {
			// この Pod が初めて見た関数（起動直後・デプロイ直後）。今から数え始める
			s.lastSeen = now
		}
		last := s.lastSeen
		if f.LastRequest.After(last) {
			last = f.LastRequest
		}
		idle := s.inflight == 0 && s.waking == nil && now.Sub(last) >= i.c.IdleTimeout
		if idle {
			s.ready = false
		}
		i.mu.Unlock()
		if !idle {
			continue
		}
		i.c.Log.Info("scale to zero", "function", f.Name, "idle", now.Sub(last).String())
		if err := i.c.Scaler.Scale(ctx, f.Name, 0); err != nil && !errors.Is(err, gateway.ErrFunctionNotFound) {
			return err
		}
	}
	return nil
}
