package usecase

import (
	"context"
	"errors"

	"github.com/javalangruntimeexception/taramanji/backend/internal/notification/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/notification/domain/service"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/errs"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/observability"
)

type NotificationUsecaseImpl struct {
	service *service.EmailService
	metrics observability.Metrics
}

var _ NotificationUsecase = (*NotificationUsecaseImpl)(nil)

func NewNotificationUsecase(s *service.EmailService, m observability.Metrics) *NotificationUsecaseImpl {
	return &NotificationUsecaseImpl{service: s, metrics: m}
}

func (u *NotificationUsecaseImpl) SendEmail(ctx context.Context, in SendEmailInput) (*SendEmailOutput, error) {
	msg := gateway.Message{To: in.To, Subject: in.Subject, Text: in.Text}
	for _, a := range in.Attachments {
		msg.Attachments = append(msg.Attachments, gateway.Attachment{Filename: a.Filename, ContentType: a.ContentType, Data: a.Data})
	}
	id, dev, err := u.service.Send(ctx, msg, in.RequireDelivery)
	switch {
	case errors.Is(err, service.ErrEmptyRecipient):
		u.metrics.Count("email.sent", 1, "status:invalid")
		return nil, errs.NewValidationError("to", err.Error()).WithCode("invalid_email")
	case err != nil:
		u.metrics.Count("email.sent", 1, "status:failed")
		return nil, errs.NewInternalError(err).WithCode("email_send_failed").WithDetail(err.Error())
	}
	status := "ok"
	if dev {
		status = "dev"
	}
	u.metrics.Count("email.sent", 1, "status:"+status, "attachments:"+boolTag(len(in.Attachments) > 0))
	return &SendEmailOutput{MessageID: id, Dev: dev}, nil
}

func boolTag(b bool) string {
	if b {
		return "true"
	}
	return "false"
}
