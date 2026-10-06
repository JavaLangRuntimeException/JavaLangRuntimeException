package service

import (
	"context"
	"errors"
	"strings"

	"github.com/javalangruntimeexception/taramanji/backend/internal/notification/domain/gateway"
)

var (
	// ErrEmptyRecipient は旧実装の「無効なメールアドレス: 空のメールアドレスが指定されました」
	ErrEmptyRecipient = errors.New("無効なメールアドレス: 空のメールアドレスが指定されました")
	// ErrDeliveryUnavailable は送信手段がない環境で、送信必須のメールを送ろうとした
	ErrDeliveryUnavailable = errors.New("メール送信の設定がありません")
)

type EmailService struct {
	mailer gateway.Mailer
}

func NewEmailService(mailer gateway.Mailer) *EmailService {
	return &EmailService{mailer: mailer}
}

func (s *EmailService) Send(ctx context.Context, m gateway.Message, requireDelivery bool) (string, bool, error) {
	var to []string
	for _, t := range m.To {
		if t = strings.TrimSpace(t); t != "" {
			to = append(to, t)
		}
	}
	if len(to) == 0 {
		return "", false, ErrEmptyRecipient
	}
	m.To = to
	id, dev, err := s.mailer.Send(ctx, m)
	if err != nil {
		return "", false, err
	}
	if dev && requireDelivery {
		return "", true, ErrDeliveryUnavailable
	}
	return id, dev, nil
}
