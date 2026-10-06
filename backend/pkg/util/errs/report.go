package errs

import (
	"context"
	"errors"
	"log/slog"

	"connectrpc.com/connect"
)

// Report はエラーログを一か所で出し分ける。
//   - クライアント起因（検証エラー・未認証・Not Found など）は WARN。原因の連鎖は出さない
//   - 内部エラー・想定外のエラーは ERROR。原因の連鎖（%v）と型を残す
//
// trace_id / span_id は logger（Datadog 連携）が ctx から自動で付ける。
func Report(ctx context.Context, err error) {
	if err == nil {
		return
	}
	if de, ok := As(err); ok {
		attrs := []any{"error_type", string(de.Type), "status", de.StatusCode}
		if de.Code != "" {
			attrs = append(attrs, "error_code", de.Code)
		}
		if de.Type == ErrorTypeInternal || de.Type == ErrorTypeConcurrency || de.Type == ErrorTypeUpstream {
			slog.ErrorContext(ctx, de.Message, append(attrs, "error", err.Error())...)
			return
		}
		slog.WarnContext(ctx, de.Message, attrs...)
		return
	}
	var ce *connect.Error
	if errors.As(err, &ce) {
		// 下流サービスから返った Connect のエラー
		level := slog.LevelWarn
		if ce.Code() == connect.CodeInternal || ce.Code() == connect.CodeUnknown || ce.Code() == connect.CodeUnavailable {
			level = slog.LevelError
		}
		slog.Log(ctx, level, "downstream error", "code", ce.Code().String(), "error", err.Error())
		return
	}
	slog.ErrorContext(ctx, "unexpected error", "error", err.Error())
}
