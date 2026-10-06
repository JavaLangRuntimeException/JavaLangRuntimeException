// Package cache は期限付きのキャッシュ（Redis）。生成対象外の拡張（docs/patterns/infra-swap.md の _ext の考え方）。
package cache

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/javalangruntimeexception/taramanji/backend/internal/content/domain/gateway"
)

type redisCache struct{ client redis.UniversalClient }

func NewRedisCache(c redis.UniversalClient) gateway.Cache { return &redisCache{client: c} }

func (r *redisCache) Get(ctx context.Context, key string, v any) (bool, error) {
	raw, err := r.client.Get(ctx, key).Bytes()
	if errors.Is(err, redis.Nil) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, json.Unmarshal(raw, v)
}

func (r *redisCache) Set(ctx context.Context, key string, v any, ttl time.Duration) error {
	raw, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return r.client.Set(ctx, key, raw, ttl).Err()
}
