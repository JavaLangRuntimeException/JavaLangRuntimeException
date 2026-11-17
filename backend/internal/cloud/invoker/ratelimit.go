package invoker

import (
	"net/http"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// ClientIPHeader は利用者の IP。Cloudflare が付け直すので、利用者は偽れない（cloud の入口は Tunnel 経由でしか届かない）
const ClientIPHeader = "Cf-Connecting-Ip"

// RateLimit は利用者（IP）ごとのリクエストの上限。1 秒に PerSecond 回、続けて Burst 回まで
type RateLimit struct {
	PerSecond int
	Burst     int
}

// limiterIdleTTL だけ来なかった利用者の数えは捨てる（満タンに戻っているので、捨てても結果は同じ）
const limiterIdleTTL = 10 * time.Minute

// Limit はログインなしの入口（*-apigw-cloud・*-storage-cloud）を大量に叩かれても、関数と Mac mini を守る。
// 超えたら 429（Retry-After: 1）を返し、next を呼ばない（関数を起こさない）。Pod ごとに数える（2 台なら最大で 2 倍）。
// Cloudflare の無料プランのレート制限は、ホスト名で絞れない（パスだけ）ので、ここで絞る。
// skip が true のリクエスト（CDN から API に渡し直したもの。1 回目で数えた）は数えない
func Limit(l RateLimit, next http.Handler, skip func(*http.Request) bool) http.Handler {
	type entry struct {
		limiter  *rate.Limiter
		lastSeen time.Time
	}
	var (
		mu        sync.Mutex
		entries   = map[string]*entry{}
		lastSweep = time.Now()
	)
	allow := func(ip string) bool {
		now := time.Now()
		mu.Lock()
		defer mu.Unlock()
		if now.Sub(lastSweep) >= limiterIdleTTL {
			for k, e := range entries {
				if now.Sub(e.lastSeen) >= limiterIdleTTL {
					delete(entries, k)
				}
			}
			lastSweep = now
		}
		e, ok := entries[ip]
		if !ok {
			e = &entry{limiter: rate.NewLimiter(rate.Limit(l.PerSecond), l.Burst)}
			entries[ip] = e
		}
		e.lastSeen = now
		return e.limiter.AllowN(now, 1)
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// ヘッダーがない（クラスターの中から）ときは、全員で 1 つの数えを使う
		if (skip == nil || !skip(r)) && !allow(r.Header.Get(ClientIPHeader)) {
			w.Header().Set("Retry-After", "1")
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = w.Write([]byte(`{"message":"リクエストが多すぎます。しばらく時間をおいてから再度お試しください。"}` + "\n"))
			return
		}
		next.ServeHTTP(w, r)
	})
}
