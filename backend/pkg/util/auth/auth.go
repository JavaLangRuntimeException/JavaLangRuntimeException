// Package auth は管理者セッション（署名付き JWT の Cookie）と、RPC ごとの認可を扱う（横断ユーティリティ）。
// ログインは identity サービスが行い、各サービスは同じ AUTH_SECRET でセッションを検証する。
package auth

import (
	"context"
	"crypto/subtle"
	"errors"
	"net/http"
	"strings"
	"time"

	"connectrpc.com/connect"
	"github.com/golang-jwt/jwt/v5"

	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/env"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/errs"
)

const (
	CookieName = "taramanji_session"
	// NextAuth の既定と同じ 30 日
	SessionTTL = 30 * 24 * time.Hour
)

type User struct {
	Email   string `json:"email"`
	Name    string `json:"name"`
	Picture string `json:"picture"`
}

type claims struct {
	User
	jwt.RegisteredClaims
}

func secret() ([]byte, error) {
	s := env.AuthSecret()
	if len(s) < 32 {
		return nil, errors.New("AUTH_SECRET must be at least 32 characters")
	}
	return []byte(s), nil
}

// Sign はログイン成功時にセッションの JWT を作る
func Sign(u User, now time.Time) (string, error) {
	key, err := secret()
	if err != nil {
		return "", err
	}
	c := claims{User: u, RegisteredClaims: jwt.RegisteredClaims{
		Subject: u.Email, IssuedAt: jwt.NewNumericDate(now), ExpiresAt: jwt.NewNumericDate(now.Add(SessionTTL)),
	}}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, c).SignedString(key)
}

// Parse は Cookie の JWT を検証する
func Parse(token string) (*User, error) {
	key, err := secret()
	if err != nil {
		return nil, err
	}
	var c claims
	if _, err := jwt.ParseWithClaims(token, &c, func(*jwt.Token) (any, error) { return key, nil },
		jwt.WithValidMethods([]string{"HS256"})); err != nil {
		return nil, err
	}
	return &c.User, nil
}

// IsAllowedAdmin は ADMIN_EMAIL（カンマ区切り）に含まれるか（大文字小文字は無視）
func IsAllowedAdmin(email string) bool {
	if email == "" {
		return false
	}
	for _, a := range strings.Split(env.AdminEmails(), ",") {
		if strings.EqualFold(strings.TrimSpace(a), email) {
			return true
		}
	}
	return false
}

// FromHeader はリクエストヘッダーの Cookie からセッションを取り出す（無ければ nil）
func FromHeader(h http.Header) *User {
	req := http.Request{Header: h}
	c, err := req.Cookie(CookieName)
	if err != nil {
		return nil
	}
	u, err := Parse(c.Value)
	if err != nil {
		return nil
	}
	return u
}

// CheckAdmin は管理者か確かめる。旧 API と同じく 未ログイン=unauthorized、許可外=not_allowed のコードを付ける
func CheckAdmin(h http.Header) (*User, error) {
	u := FromHeader(h)
	if u == nil || u.Email == "" {
		return nil, errs.NewUnauthorizedError("ログインしてください").WithCode("unauthorized")
	}
	if !IsAllowedAdmin(u.Email) {
		return u, errs.NewForbiddenError("このアカウントは許可されていません").WithCode("not_allowed")
	}
	return u, nil
}

// BearerMatches は CronJob 用のトークンを時間一定で比べる
func BearerMatches(h http.Header, expected string) bool {
	got := h.Get("Authorization")
	if expected == "" || !strings.HasPrefix(got, "Bearer ") {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(got[7:]), []byte(expected)) == 1
}

type userKey struct{}

// UserFrom は認可済みのリクエストから管理者を取り出す
func UserFrom(ctx context.Context) *User {
	u, _ := ctx.Value(userKey{}).(*User)
	return u
}

// AdminInterceptor は指定した RPC を管理者だけに許可する。
// cronProcedures は Authorization: Bearer <cronToken> でも許可する（CronJob 用）
func AdminInterceptor(adminProcedures []string, cronProcedures []string, cronToken string) connect.UnaryInterceptorFunc {
	admin := map[string]bool{}
	for _, p := range adminProcedures {
		admin[p] = true
	}
	cron := map[string]bool{}
	for _, p := range cronProcedures {
		cron[p] = true
	}
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			proc := req.Spec().Procedure
			if cron[proc] && BearerMatches(req.Header(), cronToken) {
				return next(context.WithValue(ctx, cronKey{}, true), req)
			}
			if !admin[proc] && !cron[proc] {
				return next(ctx, req)
			}
			u, err := CheckAdmin(req.Header())
			if err != nil {
				return nil, errs.ToConnect(ctx, err)
			}
			return next(context.WithValue(ctx, userKey{}, u), req)
		}
	}
}

type cronKey struct{}

// IsCron は CronJob からの呼び出しか
func IsCron(ctx context.Context) bool {
	v, _ := ctx.Value(cronKey{}).(bool)
	return v
}

// SessionInterceptor はログイン中なら Cookie のセッションを ctx に入れる（未ログインでも通す）。UserFrom で取り出す
func SessionInterceptor() connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			if u := FromHeader(req.Header()); u != nil {
				ctx = context.WithValue(ctx, userKey{}, u)
			}
			return next(ctx, req)
		}
	}
}

// SessionCookie はログイン後に返すセッションの Cookie（HttpOnly・Secure・SameSite=Lax。ホストごと）
func SessionCookie(token string, secure bool) *http.Cookie {
	return &http.Cookie{Name: CookieName, Value: token, Path: "/", MaxAge: int(SessionTTL.Seconds()),
		HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode}
}

// ClearSessionCookie はログアウトで Cookie を消す
func ClearSessionCookie(secure bool) *http.Cookie {
	return &http.Cookie{Name: CookieName, Value: "", Path: "/", MaxAge: -1, HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode}
}
