// Package redisx は Redis クライアント（APM で計装済み）。生成された Redis Repository に渡す。
package redisx

import (
	"fmt"

	redistrace "github.com/DataDog/dd-trace-go/contrib/redis/go-redis.v9/v2"
	"github.com/redis/go-redis/v9"

	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/env"
)

func New(service string) (redis.UniversalClient, error) {
	opt, err := redis.ParseURL(env.RedisURL())
	if err != nil {
		return nil, fmt.Errorf("REDIS_URL: %w", err)
	}
	return redistrace.NewClient(opt, redistrace.WithService(service+"-redis")), nil
}
