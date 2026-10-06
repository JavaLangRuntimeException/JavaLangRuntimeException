// Package gateway はログインに使う Google OpenID Connect の抽象。
package gateway

import "context"

// Profile は Google で確認したユーザー（メールアドレスは確認済みのものだけ）
type Profile struct {
	Email   string
	Name    string
	Picture string
}

type OIDC interface {
	AuthURL(redirectURI, state, codeChallenge string) string
	Exchange(ctx context.Context, redirectURI, code, verifier string) (*Profile, error)
}
