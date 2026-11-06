// Package gateway は管理者のログインに使う Cloudflare Access の抽象。
package gateway

import (
	"context"
	"time"
)

// Identity は Cloudflare Access が確かめた利用者（Access のログインを通ったメールアドレス）
type Identity struct {
	Email string
	// Expiry は Access のトークンの有効期限。セッションもこれより長くしない
	Expiry time.Time
}

// AccessVerifier は Cloudflare Access のトークン（Cf-Access-Jwt-Assertion / CF_Authorization）を検証する
type AccessVerifier interface {
	Verify(ctx context.Context, token string) (*Identity, error)
}
