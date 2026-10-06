package errs

import (
	"encoding/json"
	"net/http"
)

// Problem は RFC 7807 / RFC 9457 Problem Details for HTTP APIs
type Problem struct {
	Type     string       `json:"type"`
	Title    string       `json:"title"`
	Status   int          `json:"status"`
	Detail   string       `json:"detail,omitempty"`
	Instance string       `json:"instance,omitempty"`
	Errors   []FieldError `json:"errors,omitempty"`
	// Code は RFC 9457 の拡張メンバー（DomainError.Code）
	Code string `json:"code,omitempty"`
}

type ErrorWriter interface {
	WriteError(w http.ResponseWriter, r *http.Request, err error)
}

var errorTypeTitle = map[ErrorType]string{
	ErrorTypeValidation:   "Unprocessable Entity",
	ErrorTypeNotFound:     "Not Found",
	ErrorTypeDuplicate:    "Conflict",
	ErrorTypeUnauthorized: "Unauthorized",
	ErrorTypeForbidden:    "Forbidden",
	ErrorTypeBadRequest:   "Bad Request",
	ErrorTypeInternal:     "Internal Server Error",
	ErrorTypeConcurrency:  "Service Unavailable",
	ErrorTypeUpstream:     "Bad Gateway",
}

type problemWriter struct{}

func NewErrorWriter() ErrorWriter {
	return &problemWriter{}
}

func (pw *problemWriter) WriteError(w http.ResponseWriter, r *http.Request, err error) {
	p := Problem{
		Type:     "about:blank",
		Title:    "Internal Server Error",
		Status:   http.StatusInternalServerError,
		Instance: r.URL.Path,
	}

	if de, ok := As(err); ok {
		p.Status = de.StatusCode
		if title, exists := errorTypeTitle[de.Type]; exists {
			p.Title = title
		}
		p.Detail = de.Message
		p.Errors = de.Errors
		p.Code = de.Code
	}
	Report(r.Context(), err)

	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(p.Status)
	_ = json.NewEncoder(w).Encode(p)
}
