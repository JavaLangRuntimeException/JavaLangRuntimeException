package env

import (
	"fmt"
	"os"
	"strings"
	"sync"

	"github.com/joho/godotenv"
)

var (
	once       sync.Once
	loadDotenv = godotenv.Load
)

func init() {
	initialize()
}

func initialize() {
	once.Do(func() {
		appEnv := os.Getenv("APP_ENV")
		if appEnv == "" {
			appEnv = "local"
		}
		// silent OK if file doesn't exist — prod envs set vars directly
		_ = loadDotenv(".env." + appEnv)
	})
}

// AppEnv returns the current environment name: "local" | "dev" | "staging" | "prod".
// Defaults to "local" with a warning when APP_ENV is not set.
// Panics on unknown values.
func AppEnv() string {
	v := os.Getenv("APP_ENV")
	if v == "" {
		fmt.Fprintln(os.Stderr, "WARN: APP_ENV not set, defaulting to local")
		return "local"
	}
	switch v {
	case "local", "dev", "staging", "prod":
		return v
	default:
		panic(fmt.Sprintf("APP_ENV must be one of [local dev staging prod], got %q", v))
	}
}

// LogLevel returns "debug" for local/dev and "info" for staging/prod.
func LogLevel() string {
	switch AppEnv() {
	case "local", "dev":
		return "debug"
	default:
		return "info"
	}
}

// RedisURL returns the Redis connection URL (redis://user:pass@host:6379/db). Panics if REDIS_URL is not set.
func RedisURL() string {
	return mustGet("REDIS_URL")
}

// AuthSecret returns the secret used to sign admin session JWTs. Panics if AUTH_SECRET is not set.
func AuthSecret() string {
	return mustGet("AUTH_SECRET")
}

// AdminEmails returns ADMIN_EMAIL (comma separated). Empty when unset (nobody can sign in).
func AdminEmails() string {
	return os.Getenv("ADMIN_EMAIL")
}

// DatadogAgentHost returns DD_AGENT_HOST. Empty disables tracing and custom metrics.
func DatadogAgentHost() string {
	return os.Getenv("DD_AGENT_HOST")
}

// Required returns a service specific required variable. Panics if it is not set.
func Required(key string) string {
	return mustGet(key)
}

// Optional returns a service specific optional variable, or def when unset.
func Optional(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// ServiceURL returns the in-cluster URL of another service (http://<name>:8080).
// <NAME>_URL overrides it (e.g. NOTIFICATION_URL for local runs).
func ServiceURL(name string) string {
	return Optional(strings.ToUpper(name)+"_URL", "http://"+name+":8080")
}

// Port returns the HTTP listen address (e.g. ":8080"). Defaults to ":8080" if PORT is not set.
func Port() string {
	if v := os.Getenv("PORT"); v != "" {
		return v
	}
	return ":8080"
}

func mustGet(key string) string {
	v := os.Getenv(key)
	if v == "" {
		panic(fmt.Sprintf("env: required environment variable %q is not set", key))
	}
	return v
}
