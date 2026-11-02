// Package ratelimit は公開フォームの RPC を、利用者（IP）ごとに回数で制限する（横断ユーティリティ）。
// フォームの連打やボットで、メール送信（SES）や Calendar API が濫用されるのを防ぐ。
// 数え方は Pod ごとのメモリ（トークンバケット）。レプリカが 2 なら、最悪で上限の 2 倍まで通る
package ratelimit

import (
	"context"
	"sync"
	"time"

	"connectrpc.com/connect"
	"golang.org/x/time/rate"

	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/errs"
)

// ClientIPHeader は利用者の IP。Cloudflare が付け直すので、利用者は偽れない（オリジンは Tunnel 経由でしか届かない）
const ClientIPHeader = "Cf-Connecting-Ip"

const (
	// 最後のリクエストからこれだけ経った利用者のバケットは捨てる（満タンに戻っているので、捨てても結果は同じ）
	idleTTL = time.Hour
	// 掃除の間隔
	sweepEvery = 10 * time.Minute
)

// Rule は 1 つの RPC の上限。Burst 回まで続けて通し、そのあとは Every ごとに 1 回ずつ回復する
type Rule struct {
	Burst int
	Every time.Duration
}

type key struct {
	procedure string
	ip        string
}

type entry struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

type limiter struct {
	rules     map[string]Rule
	clock     func() time.Time
	mu        sync.Mutex
	entries   map[key]*entry
	lastSweep time.Time
}

// Interceptor は rules にある RPC だけを制限する。上限を超えたら rate_limited（ResourceExhausted）を返す
func Interceptor(rules map[string]Rule) connect.UnaryInterceptorFunc {
	return newLimiter(rules, time.Now).interceptor()
}

func newLimiter(rules map[string]Rule, clock func() time.Time) *limiter {
	return &limiter{rules: rules, clock: clock, entries: map[key]*entry{}, lastSweep: clock()}
}

func (l *limiter) interceptor() connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			proc := req.Spec().Procedure
			rule, ok := l.rules[proc]
			if !ok {
				return next(ctx, req)
			}
			// ヘッダーがない（手元・クラスター内）ときは全員で 1 つのバケットを使う
			if !l.allow(key{procedure: proc, ip: req.Header().Get(ClientIPHeader)}, rule) {
				return nil, errs.ToConnect(ctx, errs.NewCodedError(errs.ErrorTypeRateLimited, "rate_limited",
					"リクエストが多すぎます。しばらく時間をおいてから再度お試しください。"))
			}
			return next(ctx, req)
		}
	}
}

func (l *limiter) allow(k key, rule Rule) bool {
	now := l.clock()
	l.mu.Lock()
	defer l.mu.Unlock()
	if now.Sub(l.lastSweep) >= sweepEvery {
		for kk, e := range l.entries {
			if now.Sub(e.lastSeen) >= idleTTL {
				delete(l.entries, kk)
			}
		}
		l.lastSweep = now
	}
	e, ok := l.entries[k]
	if !ok {
		e = &entry{limiter: rate.NewLimiter(rate.Every(rule.Every), rule.Burst)}
		l.entries[k] = e
	}
	e.lastSeen = now
	return e.limiter.AllowN(now, 1)
}
