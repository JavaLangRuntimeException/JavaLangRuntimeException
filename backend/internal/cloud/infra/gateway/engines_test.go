package gateway

import (
	"context"
	"database/sql"
	"os"
	"strings"
	"testing"

	"github.com/redis/go-redis/v9"
)

// 実物の PostgreSQL / Redis に当てる。TEST_POSTGRES_DSN・TEST_REDIS_ADDR があるときだけ走る:
//
//	docker run -d --rm -p 55432:5432 -e POSTGRES_PASSWORD=admin postgres:17-alpine
//	docker run -d --rm -p 56379:6379 redis:7-alpine redis-server --requirepass admin
//	TEST_POSTGRES_DSN=postgres://postgres:admin@localhost:55432/postgres?sslmode=disable TEST_REDIS_ADDR=localhost:56379 go test ./internal/cloud/infra/gateway/ -run Engine
//
// テスト用の使い捨ての値（パスワードの形 = 16 進 32 文字であればよい）
var testPassword = strings.Repeat("0123456789abcdef", 2)

func TestPostgresEngine(t *testing.T) {
	dsn := os.Getenv("TEST_POSTGRES_DSN")
	if dsn == "" {
		t.Skip("TEST_POSTGRES_DSN がない")
	}
	ctx := context.Background()
	eng, err := NewPostgresEngine(dsn)
	if err != nil {
		t.Fatal(err)
	}
	// 2 回実行しても同じ結果になる
	for range 2 {
		if err := eng.Ensure(ctx, "main-db", testPassword); err != nil {
			t.Fatal(err)
		}
	}
	if err := eng.Ensure(ctx, "other", testPassword); err != nil {
		t.Fatal(err)
	}
	as := func(user, db string) *sql.DB {
		d, _ := sql.Open("pgx", strings.Replace(strings.Replace(dsn, "postgres:admin@", user+":"+testPassword+"@", 1), "/postgres?", "/"+db+"?", 1))
		return d
	}
	own := as("main_db", "main_db")
	defer own.Close()
	if _, err := own.ExecContext(ctx, "CREATE TABLE IF NOT EXISTS t (id int)"); err != nil {
		t.Fatalf("自分のデータベースには書ける: %v", err)
	}
	// ほかのデータベースにはつなげない
	other := as("main_db", "other")
	defer other.Close()
	if err := other.PingContext(ctx); err == nil {
		t.Fatal("ほかのデータベースにつなげてしまう")
	}
	// 止めるとつなげなくなるが、データベースは残る。作り直すとまた使える
	if err := eng.Disable(ctx, "main-db"); err != nil {
		t.Fatal(err)
	}
	again := as("main_db", "main_db")
	defer again.Close()
	if err := again.PingContext(ctx); err == nil {
		t.Fatal("止めたのにつなげてしまう")
	}
	if err := eng.Ensure(ctx, "main-db", testPassword); err != nil {
		t.Fatal(err)
	}
	var n int
	back := as("main_db", "main_db")
	defer back.Close()
	if err := back.QueryRowContext(ctx, "SELECT count(*) FROM t").Scan(&n); err != nil {
		t.Fatalf("中身が残っている: %v", err)
	}
	if err := eng.Disable(ctx, "never-created"); err != nil {
		t.Fatalf("ないものを止めてもエラーにしない: %v", err)
	}
	if err := eng.Ensure(ctx, `x"; DROP DATABASE postgres; --`, testPassword); err == nil {
		t.Fatal("名前でないものは通さない")
	}
}

func TestRedisEngine(t *testing.T) {
	addr := os.Getenv("TEST_REDIS_ADDR")
	if addr == "" {
		t.Skip("TEST_REDIS_ADDR がない")
	}
	ctx := context.Background()
	eng := NewRedisEngine(addr, "admin")
	for range 2 {
		if err := eng.Ensure(ctx, "cache", testPassword); err != nil {
			t.Fatal(err)
		}
	}
	c := redis.NewClient(&redis.Options{Addr: addr, Username: "cache", Password: testPassword})
	defer c.Close()
	if err := c.Set(ctx, "cache:a", "1", 0).Err(); err != nil {
		t.Fatalf("自分の接頭辞には書ける: %v", err)
	}
	if err := c.Set(ctx, "other:a", "1", 0).Err(); err == nil {
		t.Fatal("ほかの接頭辞に書けてしまう")
	}
	for _, cmd := range [][]any{{"FLUSHALL"}, {"KEYS", "*"}, {"CONFIG", "GET", "requirepass"}, {"ACL", "LIST"}} {
		if err := c.Do(ctx, cmd...).Err(); err == nil {
			t.Fatalf("%v を使えてしまう", cmd)
		}
	}
	if err := eng.Disable(ctx, "cache"); err != nil {
		t.Fatal(err)
	}
	c2 := redis.NewClient(&redis.Options{Addr: addr, Username: "cache", Password: testPassword})
	defer c2.Close()
	if err := c2.Get(ctx, "cache:a").Err(); err == nil {
		t.Fatal("止めたのに読めてしまう")
	}
}
