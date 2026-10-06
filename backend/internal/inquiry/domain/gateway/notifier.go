// Package gateway はメール送信（notification サービス）の抽象。実装は gRPC クライアント（infra/gateway）。
package gateway

import "context"

type Attachment struct {
	Filename    string
	ContentType string
	Data        []byte
}

type Mail struct {
	To          []string
	Subject     string
	Text        string
	Attachments []Attachment
	// RequireDelivery は送信手段がない環境（開発用）を失敗扱いにする
	RequireDelivery bool
}

type Notifier interface {
	Send(ctx context.Context, m Mail) (messageID string, dev bool, err error)
}
