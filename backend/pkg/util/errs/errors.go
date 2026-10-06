package errs

import (
	"errors"
	"fmt"
	"net/http"
)

type FieldError struct {
	Field   string         `json:"field"`
	Message string         `json:"message"`
	Meta    map[string]any `json:"meta,omitempty"`
}

type ErrorType string

const (
	ErrorTypeValidation   ErrorType = "VALIDATION_ERROR"
	ErrorTypeNotFound     ErrorType = "NOT_FOUND"
	ErrorTypeDuplicate    ErrorType = "DUPLICATE_ERROR"
	ErrorTypeUnauthorized ErrorType = "UNAUTHORIZED"
	ErrorTypeForbidden    ErrorType = "FORBIDDEN"
	ErrorTypeBadRequest   ErrorType = "BAD_REQUEST"
	ErrorTypeInternal     ErrorType = "INTERNAL_ERROR"
	ErrorTypeConcurrency  ErrorType = "CONCURRENCY_ERROR"
	// ErrorTypeUpstream は外部 API（Google・GAS など）の失敗。メッセージと詳細はクライアントに返す
	ErrorTypeUpstream ErrorType = "UPSTREAM_ERROR"
)

type DomainError struct {
	Type       ErrorType    `json:"type"`
	Message    string       `json:"message"`
	Errors     []FieldError `json:"-"`
	StatusCode int          `json:"-"`
	// Code はクライアントが分岐に使う機械可読なコード（例: "invalid_email"）。
	// gRPC の ErrorInfo.reason と Connect のメタデータ x-error-code に載る。
	Code string `json:"code,omitempty"`
	// Detail は調査用の詳細（外部 API の応答など）。クライアントにも返る。
	Detail string `json:"detail,omitempty"`
	cause  error
}

func (e *DomainError) Error() string {
	if e.cause != nil {
		return fmt.Sprintf("%s: %s: %v", e.Type, e.Message, e.cause)
	}
	return fmt.Sprintf("%s: %s", e.Type, e.Message)
}

// Unwrap は原因のエラーを返す（errors.Is / errors.As で辿れる）。
func (e *DomainError) Unwrap() error { return e.cause }

// WithCode は機械可読なコードを付ける。
func (e *DomainError) WithCode(code string) *DomainError {
	e.Code = code
	return e
}

// WithDetail は調査用の詳細を付ける。
func (e *DomainError) WithDetail(detail string) *DomainError {
	e.Detail = detail
	return e
}

// WithCause は原因のエラーを付ける。ログには出るが、クライアントには返らない。
func (e *DomainError) WithCause(err error) *DomainError {
	e.cause = err
	return e
}

func New(errType ErrorType, message string) *DomainError {
	e := &DomainError{
		Type:    errType,
		Message: message,
	}
	switch errType {
	case ErrorTypeValidation:
		e.StatusCode = http.StatusUnprocessableEntity
	case ErrorTypeBadRequest:
		e.StatusCode = http.StatusBadRequest
	case ErrorTypeNotFound:
		e.StatusCode = http.StatusNotFound
	case ErrorTypeUnauthorized:
		e.StatusCode = http.StatusUnauthorized
	case ErrorTypeForbidden:
		e.StatusCode = http.StatusForbidden
	case ErrorTypeDuplicate:
		e.StatusCode = http.StatusConflict
	case ErrorTypeConcurrency:
		e.StatusCode = http.StatusServiceUnavailable
	case ErrorTypeUpstream:
		e.StatusCode = http.StatusBadGateway
	default:
		e.StatusCode = http.StatusInternalServerError
	}
	return e
}

func As(err error) (*DomainError, bool) {
	if err == nil {
		return nil, false
	}
	var de *DomainError
	if errors.As(err, &de) {
		return de, true
	}
	return nil, false
}
