package errs

import (
	"context"
	"errors"

	"connectrpc.com/connect"
	"google.golang.org/genproto/googleapis/rpc/errdetails"
)

// ErrorCodeHeader はブラウザが読みやすいよう、DomainError.Code を載せるメタデータ名。
const ErrorCodeHeader = "x-error-code"

// ErrorDomain は ErrorInfo.domain（gRPC のエラーモデル）。
const ErrorDomain = "taramanji.com"

var connectCodeOf = map[ErrorType]connect.Code{
	ErrorTypeValidation:   connect.CodeInvalidArgument,
	ErrorTypeBadRequest:   connect.CodeInvalidArgument,
	ErrorTypeNotFound:     connect.CodeNotFound,
	ErrorTypeDuplicate:    connect.CodeAlreadyExists,
	ErrorTypeUnauthorized: connect.CodeUnauthenticated,
	ErrorTypeForbidden:    connect.CodePermissionDenied,
	ErrorTypeConcurrency:  connect.CodeUnavailable,
	ErrorTypeInternal:     connect.CodeInternal,
	ErrorTypeUpstream:     connect.CodeUnavailable,
}

// ToConnect は usecase が返したエラーを Connect（gRPC）のエラーに変換し、ログに残す。
//   - DomainError: 種類に応じたコード + ErrorInfo（reason = Code）+ フィールドエラーは BadRequest
//   - すでに Connect のエラー（下流サービスの失敗など）: そのまま返す
//   - それ以外: Internal。内容はログにだけ残し、クライアントには返さない
func ToConnect(ctx context.Context, err error) error {
	if err == nil {
		return nil
	}
	Report(ctx, err)

	var ce *connect.Error
	if errors.As(err, &ce) {
		return ce
	}
	de, ok := As(err)
	if !ok {
		return connect.NewError(connect.CodeInternal, errors.New("internal error"))
	}
	code, ok := connectCodeOf[de.Type]
	if !ok {
		code = connect.CodeInternal
	}
	message := de.Message
	if de.Type == ErrorTypeInternal {
		message = "internal error"
	}
	out := connect.NewError(code, errors.New(message))

	reason := de.Code
	if reason == "" {
		reason = string(de.Type)
	}
	out.Meta().Set(ErrorCodeHeader, reason)
	meta := map[string]string{"type": string(de.Type)}
	if de.Detail != "" && de.Type != ErrorTypeInternal {
		meta["detail"] = de.Detail
	}
	if d, err := connect.NewErrorDetail(&errdetails.ErrorInfo{Reason: reason, Domain: ErrorDomain, Metadata: meta}); err == nil {
		out.AddDetail(d)
	}
	if len(de.Errors) > 0 {
		br := &errdetails.BadRequest{}
		for _, fe := range de.Errors {
			br.FieldViolations = append(br.FieldViolations, &errdetails.BadRequest_FieldViolation{Field: fe.Field, Description: fe.Message})
		}
		if d, err := connect.NewErrorDetail(br); err == nil {
			out.AddDetail(d)
		}
	}
	return out
}
