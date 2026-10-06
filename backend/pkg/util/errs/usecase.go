package errs

import "fmt"

// NewValidationError はフィールドレベルのバリデーションエラーを生成する。
// usecase層でのビジネスルール違反や、handler層でのリクエスト検証に使う。
func NewValidationError(field, message string) *DomainError {
	de := New(ErrorTypeValidation, "Validation failed")
	de.Errors = []FieldError{{Field: field, Message: message}}
	return de
}

// NewBulkValidationError は複数フィールドのバリデーションエラーをまとめて生成する。
func NewBulkValidationError(fieldErrors []FieldError) *DomainError {
	de := New(ErrorTypeValidation, "Validation failed")
	de.Errors = fieldErrors
	return de
}

// NewNotFoundError はリソースが見つからないエラーを生成する。
func NewNotFoundError(resource, identifier string) *DomainError {
	return New(ErrorTypeNotFound, fmt.Sprintf("%s not found: %s", resource, identifier))
}

// NewDuplicateError はリソースの重複エラーを生成する。
func NewDuplicateError(resource, field string) *DomainError {
	de := New(ErrorTypeDuplicate, fmt.Sprintf("%s already exists", resource))
	de.Errors = []FieldError{{Field: field, Message: "already exists"}}
	return de
}

// NewForbiddenError はアクセス権限エラーを生成する。
func NewForbiddenError(message string) *DomainError {
	return New(ErrorTypeForbidden, message)
}

// NewUnauthorizedError は認証エラーを生成する。
func NewUnauthorizedError(message string) *DomainError {
	return New(ErrorTypeUnauthorized, message)
}

// NewBadRequestError はリクエスト不正エラーを生成する。
// handler層でのJSONデコード失敗などに使う。
func NewBadRequestError(message string) *DomainError {
	return New(ErrorTypeBadRequest, message)
}

// NewInternalError は想定外のエラーを包む。原因はログにだけ出し、クライアントには内容を返さない。
func NewInternalError(cause error) *DomainError {
	return New(ErrorTypeInternal, "internal error").WithCause(cause)
}

// NewCodedError はクライアントが分岐に使うコード付きのエラーを作る（旧 API のエラー文字列を引き継ぐ用途）。
func NewCodedError(errType ErrorType, code, message string) *DomainError {
	return New(errType, message).WithCode(code)
}

// NewUpstreamError は外部 API の失敗（旧 API の 502 応答）。detail は調査用にクライアントへも返す。
func NewUpstreamError(code, message, detail string) *DomainError {
	return New(ErrorTypeUpstream, message).WithCode(code).WithDetail(detail)
}
