// Package gateway は notification サービスへの gRPC クライアント。
package gateway

import (
	"context"

	"connectrpc.com/connect"

	notificationv1 "github.com/javalangruntimeexception/taramanji/backend/gen/taramanji/notification/v1"
	"github.com/javalangruntimeexception/taramanji/backend/gen/taramanji/notification/v1/notificationv1connect"
	"github.com/javalangruntimeexception/taramanji/backend/internal/inquiry/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/server"
)

type notificationClient struct {
	client notificationv1connect.NotificationServiceClient
}

// NewNotificationClient は notification サービスへ gRPC（h2c）でつなぐ
func NewNotificationClient(baseURL string) gateway.Notifier {
	return &notificationClient{client: notificationv1connect.NewNotificationServiceClient(
		server.InternalHTTPClient(), baseURL, server.InternalClientOptions()...)}
}

func (c *notificationClient) Send(ctx context.Context, m gateway.Mail) (string, bool, error) {
	req := &notificationv1.SendEmailRequest{To: m.To, Subject: m.Subject, Text: m.Text, RequireDelivery: m.RequireDelivery}
	for _, a := range m.Attachments {
		req.Attachments = append(req.Attachments, &notificationv1.Attachment{Filename: a.Filename, ContentType: a.ContentType, Data: a.Data})
	}
	res, err := c.client.SendEmail(ctx, connect.NewRequest(req))
	if err != nil {
		return "", false, err
	}
	return res.Msg.GetMessageId(), res.Msg.GetDev(), nil
}
