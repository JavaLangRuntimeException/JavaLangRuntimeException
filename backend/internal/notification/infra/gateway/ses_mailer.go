// Package gateway は Amazon SES によるメール送信。
package gateway

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"log/slog"
	"mime"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/ses"
	"github.com/aws/aws-sdk-go-v2/service/ses/types"

	"github.com/javalangruntimeexception/taramanji/backend/internal/notification/domain/gateway"
)

// 旧実装（src/shared/lib/email.ts）と同じ境界文字列
const boundary = "----=_NextJS_Email_Boundary"

type sesMailer struct {
	client *ses.Client
	from   string
	clock  func() time.Time
}

// NewSESMailer は AWS の鍵が無ければ、送信せずに成功扱いにする開発用の実装を返す（旧実装と同じ）。
func NewSESMailer(accessKeyID, secretAccessKey, region, from string, clock func() time.Time) gateway.Mailer {
	if clock == nil {
		clock = time.Now
	}
	if from == "" {
		from = "noreply@taramanji.com"
	}
	if region == "" {
		region = "ap-northeast-1"
	}
	if accessKeyID == "" || secretAccessKey == "" {
		return devMailer{clock: clock}
	}
	client := ses.New(ses.Options{
		Region:      region,
		Credentials: aws.NewCredentialsCache(credentials.NewStaticCredentialsProvider(accessKeyID, secretAccessKey, "")),
	})
	return &sesMailer{client: client, from: from, clock: clock}
}

func (m *sesMailer) Send(ctx context.Context, msg gateway.Message) (string, bool, error) {
	raw := BuildRawMessage(m.from, msg)
	out, err := m.client.SendRawEmail(ctx, &ses.SendRawEmailInput{
		Source:       aws.String(m.from),
		Destinations: msg.To,
		RawMessage:   &types.RawMessage{Data: raw},
	})
	if err != nil {
		return "", false, fmt.Errorf("AWS SES送信エラー: %w", err)
	}
	return aws.ToString(out.MessageId), false, nil
}

// BuildRawMessage は旧実装と同じ構成の MIME を作る。
// 件名・ファイル名は RFC 2047、本文は base64 にして日本語でも規格どおりに届くようにする（内容は同じ）。
func BuildRawMessage(from string, msg gateway.Message) []byte {
	var b bytes.Buffer
	fmt.Fprintf(&b, "From: %s\r\n", from)
	fmt.Fprintf(&b, "To: %s\r\n", strings.Join(msg.To, ", "))
	fmt.Fprintf(&b, "Subject: %s\r\n", mime.BEncoding.Encode("UTF-8", msg.Subject))
	b.WriteString("MIME-Version: 1.0\r\n")
	if len(msg.Attachments) == 0 {
		b.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
		b.WriteString("Content-Transfer-Encoding: base64\r\n\r\n")
		writeBase64(&b, []byte(msg.Text))
		return b.Bytes()
	}
	fmt.Fprintf(&b, "Content-Type: multipart/mixed; boundary=\"%s\"\r\n\r\n", boundary)
	fmt.Fprintf(&b, "--%s\r\n", boundary)
	b.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
	b.WriteString("Content-Transfer-Encoding: base64\r\n\r\n")
	writeBase64(&b, []byte(msg.Text))
	b.WriteString("\r\n")
	for _, a := range msg.Attachments {
		ct := a.ContentType
		if ct == "" {
			ct = "application/octet-stream"
		}
		fmt.Fprintf(&b, "--%s\r\n", boundary)
		fmt.Fprintf(&b, "Content-Type: %s\r\n", ct)
		fmt.Fprintf(&b, "Content-Disposition: attachment; filename=\"%s\"\r\n", mime.BEncoding.Encode("UTF-8", a.Filename))
		b.WriteString("Content-Transfer-Encoding: base64\r\n\r\n")
		writeBase64(&b, a.Data)
		b.WriteString("\r\n")
	}
	fmt.Fprintf(&b, "--%s--\r\n", boundary)
	return b.Bytes()
}

// writeBase64 は 76 文字ごとに改行する（RFC 2045）
func writeBase64(b *bytes.Buffer, data []byte) {
	enc := base64.StdEncoding.EncodeToString(data)
	for len(enc) > 76 {
		b.WriteString(enc[:76] + "\r\n")
		enc = enc[76:]
	}
	b.WriteString(enc + "\r\n")
}

// devMailer は SES の鍵が無い環境用。送らずにログだけ出す
type devMailer struct{ clock func() time.Time }

func (d devMailer) Send(ctx context.Context, msg gateway.Message) (string, bool, error) {
	slog.InfoContext(ctx, "[DEV] Email would be sent", "to", msg.To, "subject", msg.Subject, "attachments", len(msg.Attachments))
	return fmt.Sprintf("dev-%d", d.clock().UnixMilli()), true, nil
}
