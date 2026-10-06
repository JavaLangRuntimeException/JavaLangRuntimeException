package gateway

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/javalangruntimeexception/taramanji/backend/internal/calendarsync/domain/gateway"
)

// キー名は旧実装と同じ（前回の結果は移行でそのまま持ってくる）
const (
	lockKey     = "cal_sync:lock"
	lastRunKey  = "cal_sync:last_run"
	oauthPrefix = "cal_sync:oauth:"
)

type runState struct{ rdb redis.UniversalClient }

func NewRunState(rdb redis.UniversalClient) gateway.RunState { return &runState{rdb: rdb} }

// unlockScript は自分が取ったロックだけを外す（期限切れ後に他の実行が取ったロックを消さない）
var unlockScript = redis.NewScript(`if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) end return 0`)

func (s *runState) Lock(ctx context.Context, ttl time.Duration) (func(), error) {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	token := hex.EncodeToString(b)
	ok, err := s.rdb.SetNX(ctx, lockKey, token, ttl).Result()
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, gateway.ErrLocked
	}
	return func() {
		// 呼び出し元の ctx が切れていても外せるよう、独立した ctx を使う
		c, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = unlockScript.Run(c, s.rdb, []string{lockKey}, token).Err()
	}, nil
}

func (s *runState) LoadLastRun(ctx context.Context) (*gateway.LastRun, error) {
	raw, err := s.rdb.Get(ctx, lastRunKey).Bytes()
	if errors.Is(err, redis.Nil) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var r gateway.LastRun
	if err := json.Unmarshal(raw, &r); err != nil {
		return nil, err
	}
	return &r, nil
}

func (s *runState) SaveLastRun(ctx context.Context, r *gateway.LastRun) error {
	raw, err := json.Marshal(r)
	if err != nil {
		return err
	}
	return s.rdb.Set(ctx, lastRunKey, raw, 0).Err()
}

func (s *runState) SaveOAuthState(ctx context.Context, state, verifier string, ttl time.Duration) error {
	return s.rdb.Set(ctx, oauthPrefix+state, verifier, ttl).Err()
}

func (s *runState) TakeOAuthState(ctx context.Context, state string) (string, error) {
	v, err := s.rdb.GetDel(ctx, oauthPrefix+state).Result()
	if errors.Is(err, redis.Nil) {
		return "", nil
	}
	return v, err
}
