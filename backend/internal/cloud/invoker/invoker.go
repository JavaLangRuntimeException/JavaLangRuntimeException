// Package invoker は taramanji cloud の API Gateway（データプレーン）。
// Envoy から来たリクエストを関数（アプリ用 namespace の Deployment）に渡す。関数が 0 台なら 1 台に起こして待ち、
// しばらくリクエストが来なければ 0 台に戻す（Lambda のように、使うときだけ動く）。
//
// どの関数に渡すかは Envoy が付ける X-Cloud-Function で決まる（API の HTTPRoute の RequestHeaderModifier が上書きするので、
// 利用者は偽れない。この Pod は NetworkPolicy で cloud の Envoy からしか受けない）
package invoker

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"
	"path"
	"regexp"
	"strconv"
	"strings"
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
	// MemoryCap は環境の関数のメモリの合計の枠（バイト）。起こすと超えるなら起こさない。0 なら確かめない
	MemoryCap int64
	Clock     func() time.Time
	Log       *slog.Logger
	// StorageURL はオブジェクトストレージの読むだけのポート（http://cloud-storage:8081）。nil ならバケットを元にした CDN は使えない
	StorageURL *url.URL
	// Transport はテストで差し替える
	Transport http.RoundTripper
	// GatewayURL は cloud の Envoy（http://taramanji-cloud-gateway.envoy-gateway-system.svc.cluster.local）。
	// CDN の元が API のとき、その API のホスト名（APIHost）でここに渡し直す（API のルート・認証・CORS がそのまま効く）。nil なら API を元にした CDN は使えない
	GatewayURL *url.URL
	// APIHost は API の名前 → 公開ホスト名（<名前>-apigw-cloud.taramanji.com）
	APIHost func(name string) string
	// InternalSecret は、CDN から API に渡し直したリクエストに付ける署名の鍵（cloud-gw の Pod で同じもの）。
	// CDN は Cloudflare Access のログインの後ろなので、署名の付いたリクエストには API キーを求めない。空なら署名しない（API キーを求める）
	InternalSecret []byte
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
		// 応答を待つのは、関数の 60 秒に起動を待つ時間を足した分（CDN の元が API のときは、Envoy の先でもう一度起動を待つことがあるため）
		c.Transport = &http.Transport{MaxIdleConnsPerHost: 16, IdleConnTimeout: 30 * time.Second, ResponseHeaderTimeout: 60*time.Second + c.ColdStartTimeout}
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
	// キャッシュの長さは CDN の HTTPRoute が付ける（API の HTTPRoute は消す）
	ttl, _ := strconv.Atoi(r.Header.Get(service.HeaderCacheTTL))
	spa := r.Header.Get(service.HeaderSPA) == "true"
	bucket := r.Header.Get(service.HeaderBucket)
	apiOrigin := r.Header.Get(service.HeaderAPIOrigin)
	// CDN（ログイン済み）から渡し直したリクエストか。利用者が付けてきた値は、署名が合わないので使われない
	viaCDN := i.verifyCDN(r.Header.Get(HeaderViaCDN), r.Host)
	r.Header.Del(HeaderViaCDN)
	// 認証・CORS は API の HTTPRoute が付ける（ほかの HTTPRoute は消す）
	auth, keys := r.Header.Get(service.HeaderAuth), r.Header.Get(service.HeaderAPIKeys)
	cors := strings.Fields(r.Header.Get(service.HeaderCORS))
	for _, h := range []string{service.HeaderCacheTTL, service.HeaderSPA, service.HeaderBucket, service.HeaderAPIOrigin, service.HeaderAuth, service.HeaderAPIKeys, service.HeaderCORS, HeaderKeyName} {
		r.Header.Del(h)
	}
	if bucket != "" {
		i.serveBucket(w, r, bucket, ttl, spa)
		return
	}
	if apiOrigin != "" {
		i.serveAPI(w, r, apiOrigin, ttl)
		return
	}
	name := r.Header.Get(service.HeaderFunction)
	if !service.ValidName(name) {
		// API（HTTPRoute）を通っていない
		http.Error(w, "no function is routed for this request", http.StatusNotFound)
		return
	}
	// CORS: 許したオリジンにだけ答える。プリフライト（OPTIONS）は関数を起こさずに返す
	if len(cors) > 0 {
		w.Header().Add("Vary", "Origin")
		allow := corsAllow(cors, r.Header.Get("Origin"))
		if allow != "" {
			w.Header().Set("Access-Control-Allow-Origin", allow)
		}
		if r.Method == http.MethodOptions && r.Header.Get("Access-Control-Request-Method") != "" {
			preflight(w, r, allow)
			return
		}
	}
	// API キー: 当たらなければ関数を起こさずに 401。当たったら、キーの名前を関数に渡す（キーそのものは渡さない）
	if auth == service.AuthAPIKey && !viaCDN {
		keyName, ok := service.MatchAPIKey(keys, r.Header.Get(HeaderAPIKey))
		if !ok {
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = io.WriteString(w, `{"message":"API キーがないか、違います。x-api-key ヘッダーで送ってください"}`+"\n")
			return
		}
		r.Header.Del(HeaderAPIKey)
		r.Header.Set(HeaderKeyName, keyName)
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
	i.proxy(name, ttl, len(cors) > 0).ServeHTTP(w, r)
}

// serveAPI は CDN の元が API のとき、その API のホスト名で cloud の Envoy に渡し直す。
// Envoy が API の HTTPRoute（パスごとの関数・認証・CORS）を当てて、もう一度ここ（関数の呼び出し）に来る。
// 利用者が見ていたホスト名（CDN）は X-Forwarded-Host で関数に届く
func (i *Invoker) serveAPI(w http.ResponseWriter, r *http.Request, name string, ttl int) {
	if !service.ValidName(name) || i.c.GatewayURL == nil || i.c.APIHost == nil {
		http.Error(w, "no api is routed for this request", http.StatusNotFound)
		return
	}
	host := i.c.APIHost(name)
	(&httputil.ReverseProxy{
		Rewrite: func(pr *httputil.ProxyRequest) {
			pr.SetURL(i.c.GatewayURL)
			pr.Out.Host = host
			pr.SetXForwarded()
			if len(i.c.InternalSecret) > 0 {
				pr.Out.Header.Set(HeaderViaCDN, i.signCDN(host, i.c.Clock()))
			}
		},
		// CDN のキャッシュの長さ: 関数が自分で決めていなければ、GET の 200 に付ける
		ModifyResponse: func(res *http.Response) error {
			if ttl > 0 && res.Request.Method == http.MethodGet && res.StatusCode == http.StatusOK && res.Header.Get("Cache-Control") == "" {
				res.Header.Set("Cache-Control", cacheControl(ttl))
			}
			return nil
		},
		Transport: i.c.Transport,
		ErrorHandler: func(w http.ResponseWriter, _ *http.Request, err error) {
			i.c.Log.Warn("api origin failed", "api", name, "error", err)
			http.Error(w, "api did not respond", http.StatusBadGateway)
		},
	}).ServeHTTP(w, r)
}

// HeaderViaCDN は CDN から API に渡し直したリクエストの署名（<UNIX 秒>.<HMAC-SHA256(鍵, 秒 + "\n" + API のホスト名)>）
const HeaderViaCDN = "X-Cloud-Cdn"

// cdnSignatureTTL より古い署名は使わない（ログに残った値を、あとから使い回させない）
const cdnSignatureTTL = time.Minute

func (i *Invoker) signCDN(host string, now time.Time) string {
	ts := strconv.FormatInt(now.Unix(), 10)
	return ts + "." + i.cdnMAC(ts, host)
}

func (i *Invoker) cdnMAC(ts, host string) string {
	m := hmac.New(sha256.New, i.c.InternalSecret)
	m.Write([]byte(ts + "\n" + host))
	return hex.EncodeToString(m.Sum(nil))
}

// FromCDN は、CDN から API に渡し直したリクエスト（署名が合う）か
func (i *Invoker) FromCDN(r *http.Request) bool {
	return i.verifyCDN(r.Header.Get(HeaderViaCDN), r.Host)
}

// verifyCDN は署名が、このホスト名に向けて、この 1 分のうちに cloud-gw が付けたものか
func (i *Invoker) verifyCDN(v, host string) bool {
	if v == "" || len(i.c.InternalSecret) == 0 {
		return false
	}
	ts, mac, ok := strings.Cut(v, ".")
	if !ok {
		return false
	}
	sec, err := strconv.ParseInt(ts, 10, 64)
	if err != nil {
		return false
	}
	if d := i.c.Clock().Sub(time.Unix(sec, 0)); d > cdnSignatureTTL || d < -cdnSignatureTTL {
		return false
	}
	return hmac.Equal([]byte(mac), []byte(i.cdnMAC(ts, host)))
}

// API キーのヘッダー（利用者が送る）と、当たったキーの名前（関数に渡す）
const (
	HeaderAPIKey  = "X-Api-Key"
	HeaderKeyName = "X-Api-Key-Name"
)

// corsAllow は Origin が許したオリジンなら、Access-Control-Allow-Origin に入れる値を返す（* を許していれば *）
func corsAllow(allowed []string, origin string) string {
	if origin == "" {
		return ""
	}
	o := service.NormalizeOrigin(origin)
	for _, a := range allowed {
		if a == "*" {
			return "*"
		}
		if a == o {
			return origin
		}
	}
	return ""
}

var requestHeadersRe = regexp.MustCompile(`^[A-Za-z0-9!#$%&'*+.^_|~,\- ]*$`)

// preflight は CORS のプリフライトに答える（関数は起こさない）。許していないオリジンには 403
func preflight(w http.ResponseWriter, r *http.Request, allow string) {
	if allow == "" {
		http.Error(w, "origin is not allowed", http.StatusForbidden)
		return
	}
	h := w.Header()
	h.Set("Access-Control-Allow-Methods", "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS")
	if req := r.Header.Get("Access-Control-Request-Headers"); req != "" && len(req) <= 1024 && requestHeadersRe.MatchString(req) {
		h.Set("Access-Control-Allow-Headers", req)
	}
	h.Set("Access-Control-Max-Age", "600")
	h.Add("Vary", "Access-Control-Request-Method")
	h.Add("Vary", "Access-Control-Request-Headers")
	w.WriteHeader(http.StatusNoContent)
}

// ErrCapacity は、起こすと環境の関数のメモリの合計の枠を超える
var ErrCapacity = errors.New("not enough capacity to start the function")

func (i *Invoker) fail(w http.ResponseWriter, name string, err error) {
	switch {
	case errors.Is(err, gateway.ErrFunctionNotFound):
		http.Error(w, "function not found", http.StatusNotFound)
	case errors.Is(err, ErrCapacity):
		i.c.Log.Warn("capacity exceeded", "function", name)
		w.Header().Set("Retry-After", "60")
		http.Error(w, "not enough capacity to start the function (other functions are using the memory)", http.StatusServiceUnavailable)
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
			if err := i.checkCapacity(ctx, st); err != nil {
				return err
			}
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

func (i *Invoker) proxy(name string, ttl int, corsManaged bool) *httputil.ReverseProxy {
	target := i.c.Upstream(name)
	return &httputil.ReverseProxy{
		// CDN を通した関数: 関数が自分で決めていなければ、GET の 200 にキャッシュの長さを付ける
		ModifyResponse: func(res *http.Response) error {
			if ttl > 0 && res.Request.Method == http.MethodGet && res.StatusCode == http.StatusOK && res.Header.Get("Cache-Control") == "" {
				res.Header.Set("Cache-Control", cacheControl(ttl))
			}
			// CORS を API Gateway が受け持つときは、関数の Access-Control-Allow-Origin を使わない（2 つ付くとブラウザが弾く）
			if corsManaged {
				res.Header.Del("Access-Control-Allow-Origin")
			}
			return nil
		},
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

func cacheControl(ttl int) string {
	if ttl <= 0 {
		return "no-cache"
	}
	return "public, max-age=" + strconv.Itoa(ttl)
}

// ストレージから利用者にそのまま渡すヘッダー
var objectHeaders = []string{"Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "ETag", "Last-Modified", "X-Content-Type-Options"}

// serveBucket は CDN の元がバケットのとき、パスをキーにしてオブジェクトを返す（GET と HEAD だけ）。
//   - / で終わるパスと、拡張子のないパスにファイルがないときは、その下の index.html を返す
//   - spa なら、ファイルがないパスに /index.html を 200 で返す（画面側のルーティングに任せる）
func (i *Invoker) serveBucket(w http.ResponseWriter, r *http.Request, bucket string, ttl int, spa bool) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if i.c.StorageURL == nil || !service.ValidName(bucket) {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	key := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
	candidates := []string{key}
	switch {
	case key == "" || strings.HasSuffix(r.URL.Path, "/"):
		candidates = []string{path.Join(key, "index.html")}
	case path.Ext(key) == "":
		candidates = append(candidates, key+"/index.html")
	}
	if spa && candidates[len(candidates)-1] != "index.html" {
		candidates = append(candidates, "index.html")
	}
	for _, k := range candidates {
		res, err := i.fetchObject(r, bucket, k)
		if err != nil {
			i.c.Log.Warn("storage failed", "bucket", bucket, "error", err)
			http.Error(w, "storage did not respond", http.StatusBadGateway)
			return
		}
		if res.StatusCode == http.StatusNotFound {
			res.Body.Close()
			continue
		}
		defer res.Body.Close()
		for _, h := range objectHeaders {
			if v := res.Header.Get(h); v != "" {
				w.Header().Set(h, v)
			}
		}
		if res.StatusCode == http.StatusOK || res.StatusCode == http.StatusPartialContent || res.StatusCode == http.StatusNotModified {
			w.Header().Set("Cache-Control", cacheControl(ttl))
		}
		w.WriteHeader(res.StatusCode)
		_, _ = io.Copy(w, res.Body)
		return
	}
	// ないものはキャッシュさせない（あとから置いたファイルがすぐ見えるように）
	w.Header().Set("Cache-Control", "no-store")
	http.Error(w, "not found", http.StatusNotFound)
}

func (i *Invoker) fetchObject(r *http.Request, bucket, key string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(r.Context(), r.Method, i.c.StorageURL.JoinPath(bucket, key).String(), nil)
	if err != nil {
		return nil, err
	}
	for _, h := range []string{"Range", "If-None-Match", "If-Modified-Since", "If-Range"} {
		if v := r.Header.Get(h); v != "" {
			req.Header.Set(h, v)
		}
	}
	return i.c.Transport.RoundTrip(req)
}

// checkCapacity は、fn を 1 台起こしても、環境の関数のメモリの合計が枠に収まるかを確かめる。
// 関数は namespace ごとに分かれていて ResourceQuota では合計を縛れないので、起こすときにここで縛る
func (i *Invoker) checkCapacity(ctx context.Context, fn gateway.FunctionState) error {
	if i.c.MemoryCap <= 0 {
		return nil
	}
	running, err := i.c.Scaler.Running(ctx)
	if err != nil {
		return err
	}
	total := fn.MemoryBytes
	for _, r := range running {
		if r.Name != fn.Name {
			total += r.MemoryBytes * int64(r.Replicas)
		}
	}
	if total > i.c.MemoryCap {
		return ErrCapacity
	}
	return nil
}
