package gateway

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"regexp"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/redis/go-redis/v9"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/service"
)

var (
	// SQL に埋め込む名前とパスワードは、この形のものだけ（DDL は値を引数で渡せない）
	identRe    = regexp.MustCompile(`^[a-z][a-z0-9_]{0,62}$`)
	passwordRe = regexp.MustCompile(`^[0-9a-f]{32,128}$`)
)

type postgres struct{ db *sql.DB }

// NewPostgresEngine の dsn は、共有の PostgreSQL に管理者でつなぐ URL
func NewPostgresEngine(dsn string) (gateway.DatabaseEngine, error) {
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(2)
	return &postgres{db: db}, nil
}

func pgIdent(name string) (string, error) {
	id := service.PostgresIdent(name)
	if !identRe.MatchString(id) {
		return "", fmt.Errorf("invalid database name %q", name)
	}
	return `"` + id + `"`, nil
}

func (p *postgres) exists(ctx context.Context, query, name string) (bool, error) {
	var one int
	err := p.db.QueryRowContext(ctx, query, service.PostgresIdent(name)).Scan(&one)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}

// Ensure はロールとデータベースを作る（あれば、パスワードとログインだけそろえる）。
// ほかのデータベースのユーザーからはつなげない（PUBLIC の権限を外す）
func (p *postgres) Ensure(ctx context.Context, name, password string) error {
	id, err := pgIdent(name)
	if err != nil {
		return err
	}
	if !passwordRe.MatchString(password) {
		return errors.New("invalid password")
	}
	hasRole, err := p.exists(ctx, "SELECT 1 FROM pg_roles WHERE rolname = $1", name)
	if err != nil {
		return err
	}
	verb := "ALTER"
	if !hasRole {
		verb = "CREATE"
	}
	if _, err := p.db.ExecContext(ctx, fmt.Sprintf("%s ROLE %s LOGIN PASSWORD '%s'", verb, id, password)); err != nil {
		return err
	}
	hasDB, err := p.exists(ctx, "SELECT 1 FROM pg_database WHERE datname = $1", name)
	if err != nil {
		return err
	}
	if !hasDB {
		if _, err := p.db.ExecContext(ctx, fmt.Sprintf("CREATE DATABASE %s OWNER %s", id, id)); err != nil {
			return err
		}
	}
	_, err = p.db.ExecContext(ctx, fmt.Sprintf("REVOKE ALL ON DATABASE %s FROM PUBLIC", id))
	return err
}

// Disable はロールのログインを止め、つながっている接続を切る。データベースは残す
func (p *postgres) Disable(ctx context.Context, name string) error {
	id, err := pgIdent(name)
	if err != nil {
		return err
	}
	hasRole, err := p.exists(ctx, "SELECT 1 FROM pg_roles WHERE rolname = $1", name)
	if err != nil || !hasRole {
		return err
	}
	if _, err := p.db.ExecContext(ctx, fmt.Sprintf("ALTER ROLE %s NOLOGIN", id)); err != nil {
		return err
	}
	_, err = p.db.ExecContext(ctx, "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = $1", service.PostgresIdent(name))
	return err
}

type redisEngine struct{ rdb *redis.Client }

// NewRedisEngine は共有の Redis に、管理者（default ユーザー）でつなぐ
func NewRedisEngine(addr, password string) gateway.DatabaseEngine {
	return &redisEngine{rdb: redis.NewClient(&redis.Options{Addr: addr, Password: password})}
}

// Ensure は ACL のユーザーを作る。触れるのは <名前>: で始まるキーとチャンネルだけで、
// 管理用・危険なコマンド（KEYS・FLUSHALL・CONFIG など）は使えない。
// ACL は Redis のメモリにあるので、Redis が再起動したら次の回にまた作る
func (r *redisEngine) Ensure(ctx context.Context, name, password string) error {
	if !service.ValidName(name) || !passwordRe.MatchString(password) {
		return errors.New("invalid database name or password")
	}
	prefix := service.RedisPrefix(name)
	return r.rdb.Do(ctx, "ACL", "SETUSER", name, "reset", "on", ">"+password, "~"+prefix+"*", "&"+prefix+"*", "+@all", "-@admin", "-@dangerous", "+info").Err()
}

// Disable はユーザーを消す（つながっている接続も切れる）。キーは残す
func (r *redisEngine) Disable(ctx context.Context, name string) error {
	if !service.ValidName(name) {
		return errors.New("invalid database name")
	}
	return r.rdb.Do(ctx, "ACL", "DELUSER", name).Err()
}
