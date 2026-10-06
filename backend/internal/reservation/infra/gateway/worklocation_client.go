package gateway

import (
	"context"

	"connectrpc.com/connect"

	worklocationv1 "github.com/javalangruntimeexception/taramanji/backend/gen/taramanji/worklocation/v1"
	"github.com/javalangruntimeexception/taramanji/backend/gen/taramanji/worklocation/v1/worklocationv1connect"
	"github.com/javalangruntimeexception/taramanji/backend/internal/reservation/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/server"
)

type workLocationClient struct {
	client worklocationv1connect.WorkLocationServiceClient
}

// NewWorkLocationClient は worklocation サービスへ gRPC（h2c）でつなぐ
func NewWorkLocationClient(baseURL string) gateway.WorkLocations {
	return &workLocationClient{client: worklocationv1connect.NewWorkLocationServiceClient(
		server.InternalHTTPClient(), baseURL, server.InternalClientOptions()...)}
}

func (c *workLocationClient) Get(ctx context.Context, date string) (string, error) {
	res, err := c.client.GetWorkLocation(ctx, connect.NewRequest(&worklocationv1.GetWorkLocationRequest{Date: date}))
	if err != nil {
		return "", err
	}
	return res.Msg.GetLocation(), nil
}
