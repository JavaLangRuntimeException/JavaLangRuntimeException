package usecase

import (
	"context"
	"regexp"
	"strings"

	"github.com/javalangruntimeexception/taramanji/backend/internal/inquiry/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/inquiry/domain/service"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/errs"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/observability"
)

const (
	maxFiles    = 5
	maxFileSize = 3 * 1024 * 1024
)

// emailPattern は旧 API と同じ /^[^\s@]+@[^\s@]+\.[^\s@]+$/
var emailPattern = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)

type InquiryUsecaseImpl struct {
	notifier        gateway.Notifier
	notifyTo        []string // お問い合わせの通知先（カンマ区切りを分割済み）
	questionnaireTo string
	metrics         observability.Metrics
}

var _ InquiryUsecase = (*InquiryUsecaseImpl)(nil)

func NewInquiryUsecase(n gateway.Notifier, notifyTo, questionnaireTo string, m observability.Metrics) *InquiryUsecaseImpl {
	var to []string
	seen := map[string]bool{}
	for _, a := range strings.Split(notifyTo, ",") {
		if a = strings.TrimSpace(a); a != "" && !seen[a] {
			seen[a] = true
			to = append(to, a)
		}
	}
	return &InquiryUsecaseImpl{notifier: n, notifyTo: to, questionnaireTo: questionnaireTo, metrics: m}
}

func (u *InquiryUsecaseImpl) SubmitContact(ctx context.Context, in SubmitContactInput) error {
	if in.Email == "" || in.Name == "" || in.Subject == "" || in.Purpose == "" || in.Message == "" {
		return errs.NewCodedError(errs.ErrorTypeBadRequest, "missing_required_fields", "必須項目を入力してください")
	}
	if in.Purpose == "Ask Me" && strings.TrimSpace(in.EventID) == "" {
		return errs.NewValidationError("eventId", "EventIDを入力してください").WithCode("missing_required_fields")
	}
	if !emailPattern.MatchString(in.Email) {
		return errs.NewValidationError("email", "メールアドレスの形式が正しくありません").WithCode("invalid_email")
	}
	if len(in.Files) > maxFiles {
		return errs.NewValidationError("files", "添付ファイルは5個までです").WithCode("too_many_files")
	}
	var attachments []gateway.Attachment
	var files []service.ContactFile
	for _, f := range in.Files {
		if len(f.Data) > maxFileSize {
			return errs.NewValidationError("files", "ファイルサイズは3MBまでです").WithCode("file_too_large")
		}
		ct := f.ContentType
		if ct == "" {
			ct = "application/octet-stream"
		}
		attachments = append(attachments, gateway.Attachment{Filename: f.Name, ContentType: ct, Data: f.Data})
		files = append(files, service.ContactFile{Name: f.Name, ContentType: ct, Size: len(f.Data)})
	}
	form := service.ContactForm{Email: in.Email, Name: in.Name, Organization: in.Organization,
		Subject: in.Subject, Purpose: in.Purpose, Message: in.Message, EventID: in.EventID}
	info := service.FileInfo(files)

	// 旧実装と同じく管理者宛を先に送り、その後に確認メール（どちらも添付付き）
	if len(u.notifyTo) > 0 {
		if _, _, err := u.notifier.Send(ctx, gateway.Mail{To: u.notifyTo, Subject: service.AdminSubject(in.Purpose, in.Name),
			Text: service.AdminMessage(form, info), Attachments: attachments}); err != nil {
			u.metrics.Count("inquiry.contact", 1, "status:failed", "purpose:"+in.Purpose)
			return errs.NewInternalError(err).WithCode("email_send_failed")
		}
	}
	if _, _, err := u.notifier.Send(ctx, gateway.Mail{To: []string{in.Email}, Subject: service.UserSubject(in.Subject),
		Text: service.UserMessage(form, info), Attachments: attachments}); err != nil {
		u.metrics.Count("inquiry.contact", 1, "status:failed", "purpose:"+in.Purpose)
		return errs.NewInternalError(err).WithCode("email_send_failed")
	}
	u.metrics.Count("inquiry.contact", 1, "status:ok", "purpose:"+in.Purpose)
	return nil
}

func (u *InquiryUsecaseImpl) SubmitQuestionnaire(ctx context.Context, in SubmitQuestionnaireInput) error {
	q := service.Questionnaire{Name: in.Name, VRUsage: in.VrUsage, Height: in.Height, TrialPattern: in.TrialPattern, Responses: in.Responses}
	if bad := q.Validate(); len(bad) > 0 {
		var fe []errs.FieldError
		for _, f := range bad {
			fe = append(fe, errs.FieldError{Field: f, Message: "回答は必須です"})
		}
		return errs.NewBulkValidationError(fe).WithCode("invalid_answers")
	}
	if _, _, err := u.notifier.Send(ctx, gateway.Mail{To: []string{u.questionnaireTo}, Subject: "実験アンケート回答",
		Text: service.QuestionnaireMail(q), RequireDelivery: true}); err != nil {
		u.metrics.Count("inquiry.questionnaire", 1, "status:failed")
		return errs.NewInternalError(err).WithCode("internal_server_error")
	}
	u.metrics.Count("inquiry.questionnaire", 1, "status:ok")
	return nil
}

func (u *InquiryUsecaseImpl) SendAdminEmail(ctx context.Context, in SendAdminEmailInput) (*SendAdminEmailOutput, error) {
	if in.To == "" || in.Subject == "" || in.Body == "" {
		return nil, errs.NewCodedError(errs.ErrorTypeBadRequest, "missing_required_fields", "全ての項目を入力してください")
	}
	if !emailPattern.MatchString(in.To) {
		return nil, errs.NewValidationError("to", "メールアドレスの形式が正しくありません").WithCode("invalid_email")
	}
	id, dev, err := u.notifier.Send(ctx, gateway.Mail{To: []string{in.To}, Subject: in.Subject, Text: in.Body})
	if err != nil {
		return nil, errs.NewInternalError(err).WithCode("email_send_failed")
	}
	return &SendAdminEmailOutput{MessageID: id, Dev: dev}, nil
}
