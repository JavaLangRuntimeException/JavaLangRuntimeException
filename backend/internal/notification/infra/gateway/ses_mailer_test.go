package gateway

import (
	"bytes"
	"io"
	"mime"
	"mime/multipart"
	"net/mail"
	"strings"
	"testing"

	"encoding/base64"

	"github.com/javalangruntimeexception/taramanji/backend/internal/notification/domain/gateway"
)

func decodePart(t *testing.T, r io.Reader, cte string) string {
	t.Helper()
	b, _ := io.ReadAll(r)
	if cte == "base64" {
		d, err := base64.StdEncoding.DecodeString(strings.ReplaceAll(string(b), "\r\n", ""))
		if err != nil {
			t.Fatal(err)
		}
		return string(d)
	}
	return string(b)
}

func TestBuildRawMessage_TextOnlyRoundTrip(t *testing.T) {
	raw := BuildRawMessage("noreply@taramanji.com", gateway.Message{
		To: []string{"a@example.com"}, Subject: "【お問い合わせ確認】件名", Text: "お問い合わせありがとうございます。\n\n本文",
	})
	m, err := mail.ReadMessage(bytes.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	subject, _ := new(mime.WordDecoder).DecodeHeader(m.Header.Get("Subject"))
	if subject != "【お問い合わせ確認】件名" || m.Header.Get("From") != "noreply@taramanji.com" {
		t.Fatalf("headers: %q %q", subject, m.Header.Get("From"))
	}
	if got := decodePart(t, m.Body, m.Header.Get("Content-Transfer-Encoding")); got != "お問い合わせありがとうございます。\n\n本文" {
		t.Fatalf("body: %q", got)
	}
}

func TestBuildRawMessage_AttachmentsRoundTrip(t *testing.T) {
	raw := BuildRawMessage("noreply@taramanji.com", gateway.Message{
		To: []string{"a@example.com", "b@example.com"}, Subject: "s", Text: "本文",
		Attachments: []gateway.Attachment{{Filename: "資料.pdf", ContentType: "application/pdf", Data: []byte("%PDF-1.4 data")}},
	})
	m, err := mail.ReadMessage(bytes.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	mt, params, _ := mime.ParseMediaType(m.Header.Get("Content-Type"))
	if mt != "multipart/mixed" || params["boundary"] != boundary {
		t.Fatalf("content-type: %s %v", mt, params)
	}
	mr := multipart.NewReader(m.Body, params["boundary"])
	text, _ := mr.NextPart()
	if got := decodePart(t, text, text.Header.Get("Content-Transfer-Encoding")); got != "本文" {
		t.Fatalf("text: %q", got)
	}
	att, _ := mr.NextPart()
	name, _ := new(mime.WordDecoder).DecodeHeader(att.FileName())
	if name != "資料.pdf" || att.Header.Get("Content-Type") != "application/pdf" {
		t.Fatalf("attachment: %q %q", name, att.Header.Get("Content-Type"))
	}
	if got := decodePart(t, att, att.Header.Get("Content-Transfer-Encoding")); got != "%PDF-1.4 data" {
		t.Fatalf("attachment data: %q", got)
	}
	if _, err := mr.NextPart(); err != io.EOF {
		t.Fatalf("want end of parts, got %v", err)
	}
}
