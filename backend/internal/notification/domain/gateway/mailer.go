// Package gateway はメール送信の抽象（実装は infra/gateway）。
package gateway

import "context"

type Attachment struct {
	Filename    string
	ContentType string
	Data        []byte
}

type Message struct {
	To          []string
	Subject     string
	Text        string
	Attachments []Attachment
}

type Mailer interface {
	// Send は送信して Message-ID を返す。dev=true は送信手段がなく実際には送っていない
	Send(ctx context.Context, m Message) (messageID string, dev bool, err error)
}
