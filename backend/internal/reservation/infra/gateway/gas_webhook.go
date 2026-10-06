package gateway

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/reservation/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/errs"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/httpx"
)

const (
	webhookTimeout = 30 * time.Second
	maxDetail      = 500
	// redirectErrorNote は転送先に届かなかったが、GAS は最初の POST で予定を作っているときの注記（旧 API と同じ）
	redirectErrorNote = "Event was created successfully, but eventId could not be retrieved due to redirect error"
)

// gasWebhook は Google Apps Script のウェブアプリ経由で予定を読み書きする（本番の経路）。
// GAS は POST に 302 を返し、結果は転送先にある。旧実装で確かめた手順（本文 → 転送先へ POST → 405 なら GET）をそのまま守る。
type gasWebhook struct {
	url        string
	calendarID string
	ownerEmail string
	noRedirect *http.Client
	client     *http.Client
}

func NewGasWebhook(webhookURL, calendarID, ownerEmail string) gateway.Calendar {
	return &gasWebhook{url: webhookURL, calendarID: calendarID, ownerEmail: ownerEmail,
		noRedirect: httpx.NoRedirect(webhookTimeout), client: httpx.New(webhookTimeout)}
}

func (g *gasWebhook) Name() string { return "gas_webhook" }

type gasDateTime struct {
	DateTime string `json:"dateTime"`
	TimeZone string `json:"timeZone"`
}

type gasAttendee struct {
	Email string `json:"email"`
}

type gasCreate struct {
	CalendarID    string        `json:"calendarId"`
	OwnerEmail    string        `json:"ownerEmail"`
	Summary       string        `json:"summary"`
	Description   string        `json:"description"`
	Start         gasDateTime   `json:"start"`
	End           gasDateTime   `json:"end"`
	Attendees     []gasAttendee `json:"attendees"`
	ContactMethod string        `json:"contactMethod,omitempty"`
	CreateMeet    bool          `json:"createMeet"`
}

type gasAction struct {
	Action     string `json:"action"`
	CalendarID string `json:"calendarId"`
	EventID    string `json:"eventId"`
}

// gasResult は GAS の応答。ok が true なら成功
type gasResult struct {
	OK       *bool   `json:"ok"`
	EventID  *string `json:"eventId"`
	HTMLLink *string `json:"htmlLink"`
	MeetLink *string `json:"meetLink"`
	Invited  *bool   `json:"invited"`
	Note     *string `json:"note"`
	Deleted  *bool   `json:"deleted"`
	Error    string  `json:"error"`
	Message  string  `json:"message"`
}

func (r *gasResult) succeeded() bool { return r != nil && r.OK != nil && *r.OK }

func str(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func (r *gasResult) created() *gateway.Created {
	c := &gateway.Created{EventID: str(r.EventID), HTMLLink: str(r.HTMLLink), MeetLink: str(r.MeetLink), Note: str(r.Note)}
	if r.Invited != nil {
		c.Invited = *r.Invited
	}
	return c
}

// localDateTime は GAS に渡す日本時間の日時（秒まで、時差なし）
func localDateTime(t time.Time) string { return t.Format("2006-01-02T15:04:05") }

func (g *gasWebhook) Create(ctx context.Context, e gateway.Event) (*gateway.Created, error) {
	attendees := []gasAttendee{}
	for _, a := range e.Attendees {
		attendees = append(attendees, gasAttendee{Email: a})
	}
	payload := gasCreate{
		CalendarID: g.calendarID, OwnerEmail: g.ownerEmail, Summary: e.Summary, Description: e.Description,
		Start:     gasDateTime{DateTime: localDateTime(e.Start), TimeZone: "Asia/Tokyo"},
		End:       gasDateTime{DateTime: localDateTime(e.End), TimeZone: "Asia/Tokyo"},
		Attendees: attendees, ContactMethod: e.ContactMethod, CreateMeet: e.CreateMeet,
	}
	res, err := g.call(ctx, payload, redirect405Create)
	if err != nil {
		var re *redirectError
		if asRedirectError(err, &re) {
			// GAS は最初の POST の時点で予定を作っている（旧 API と同じく成功として返す）
			return &gateway.Created{Note: redirectErrorNote}, nil
		}
		return nil, err
	}
	return res.created(), nil
}

func (g *gasWebhook) Delete(ctx context.Context, eventID string) (bool, error) {
	res, err := g.call(ctx, gasAction{Action: "delete", CalendarID: g.calendarID, EventID: eventID}, redirect405Delete)
	if err != nil {
		var re *redirectError
		if asRedirectError(err, &re) {
			return false, errs.NewUpstreamError("webhook_redirect_error", "Could not confirm delete operation status due to redirect error", re.cause.Error())
		}
		return false, err
	}
	if res.Deleted != nil {
		return *res.Deleted, nil
	}
	return true, nil
}

// Get は旧 API と同じく、リダイレクトは自動でたどる（302 の後は GET になる）
func (g *gasWebhook) Get(ctx context.Context, eventID string) (*gateway.Created, error) {
	body, _ := json.Marshal(gasAction{Action: "get", CalendarID: g.calendarID, EventID: eventID})
	status, text, err := g.do(ctx, g.client, http.MethodPost, g.url, body)
	if err != nil {
		return nil, errs.NewUpstreamError("webhook_error", "", "").WithCause(err)
	}
	if status < 200 || status >= 300 {
		return nil, webhookFailed(status, text, false)
	}
	res, perr := parseResult(text)
	if perr != nil {
		return nil, perr
	}
	return res.created(), nil
}

// redirect405 は転送先が POST を受け付けなかったときの扱い（作成と削除で旧 API の挙動が少し違う）
type redirect405 struct {
	message, detail string
	// getMustBeOK は GET の応答が 2xx のときだけ結果として読む（削除）
	getMustBeOK bool
	// passGetError は GET の結果が ok:false ならそのエラーを返す（作成）
	passGetError bool
}

var (
	redirect405Create = redirect405{
		message:      "Google Apps Script のリダイレクト先から予約作成結果を取得できませんでした。",
		detail:       "初回POSTは受理されましたが、redirect先URLはPOSTを受け付けず、結果の確定もできませんでした。",
		passGetError: true,
	}
	redirect405Delete = redirect405{
		message: "Google Apps ScriptのWebアプリ設定に問題があります。リダイレクト先のURLがPOSTリクエストを受け付けていません。",
		detail: "削除操作は実行された可能性がありますが、確認できませんでした。Google Apps ScriptのWebアプリの設定を確認してください。\n" +
			"Google Apps Scriptのエディタで「公開」→「ウェブアプリとして公開」を確認し、最新バージョンがデプロイされているか確認してください。",
		getMustBeOK: true,
	}
)

// redirectError は転送先への通信そのものに失敗したこと（作成では成功扱いにする）
type redirectError struct{ cause error }

func (e *redirectError) Error() string { return "webhook redirect: " + e.cause.Error() }

func asRedirectError(err error, target **redirectError) bool {
	re, ok := err.(*redirectError)
	if ok {
		*target = re
	}
	return ok
}

func isRedirect(status int) bool {
	return status == http.StatusMovedPermanently || status == http.StatusFound ||
		status == http.StatusTemporaryRedirect || status == http.StatusPermanentRedirect
}

func truncate(s string) string {
	if len(s) <= maxDetail {
		return s
	}
	// UTF-8 の途中で切らない
	cut := maxDetail
	for cut > 0 && !utf8Start(s[cut]) {
		cut--
	}
	return s[:cut]
}

func utf8Start(b byte) bool { return b&0xC0 != 0x80 }

func webhookFailed(status int, text string, cut bool) error {
	if cut {
		text = truncate(text)
	}
	return errs.NewUpstreamError("webhook_failed", "", "HTTP "+strconv.Itoa(status)+": "+text)
}

// parseResult は GAS の応答（JSON）を読む。ok でなければ旧 API と同じエラーコードにする
func parseResult(text string) (*gasResult, error) {
	var res gasResult
	if err := json.Unmarshal([]byte(text), &res); err != nil {
		return nil, errs.NewUpstreamError("webhook_unexpected_response", "", text)
	}
	if !res.succeeded() {
		return nil, errs.NewUpstreamError("webhook_returned_error", "", text)
	}
	return &res, nil
}

// call は旧 API の手順どおりにウェブフックを呼ぶ
func (g *gasWebhook) call(ctx context.Context, payload any, on405 redirect405) (*gasResult, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, errs.NewInternalError(err)
	}
	status, text, location, err := g.first(ctx, body)
	if err != nil {
		return nil, errs.NewUpstreamError("webhook_error", "", "").WithCause(err)
	}
	if isRedirect(status) {
		// 1. 302 の本文に結果が入っていることがある
		if strings.TrimSpace(text) != "" {
			if res, perr := parseResult(text); perr == nil {
				return res, nil
			}
		}
		// 2. 転送先へ同じ内容を POST し、405 なら GET で結果を取りに行く
		if location != "" {
			return g.followRedirect(ctx, location, body, on405)
		}
		if strings.TrimSpace(text) == "" {
			return nil, errs.NewUpstreamError("webhook_redirect_no_location", "", "")
		}
	}
	if status < 200 || status >= 300 {
		return nil, webhookFailed(status, text, true)
	}
	return parseResult(text)
}

func (g *gasWebhook) first(ctx context.Context, body []byte) (int, string, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, g.url, bytes.NewReader(body))
	if err != nil {
		return 0, "", "", err
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := g.noRedirect.Do(req)
	if err != nil {
		return 0, "", "", err
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	return res.StatusCode, string(b), res.Header.Get("Location"), nil
}

func (g *gasWebhook) followRedirect(ctx context.Context, location string, body []byte, on405 redirect405) (*gasResult, error) {
	target, err := resolve(g.url, location)
	if err != nil {
		return nil, &redirectError{cause: err}
	}
	status, text, err := g.do(ctx, g.client, http.MethodPost, target, body)
	if err != nil {
		return nil, &redirectError{cause: err}
	}
	if status >= 200 && status < 300 {
		return parseResult(text)
	}
	if status != http.StatusMethodNotAllowed {
		return nil, webhookFailed(status, text, true)
	}
	// 405: 転送先は GET でしか結果を返さない
	gs, gt, gerr := g.do(ctx, g.client, http.MethodGet, target, nil)
	if gerr == nil && strings.TrimSpace(gt) != "" && (!on405.getMustBeOK || (gs >= 200 && gs < 300)) {
		var res gasResult
		if json.Unmarshal([]byte(gt), &res) == nil {
			if res.succeeded() {
				return &res, nil
			}
			if res.OK != nil && on405.passGetError {
				code := res.Error
				if code == "" {
					code = "webhook_returned_error"
				}
				return nil, errs.NewUpstreamError(code, res.Message, gt)
			}
		}
	}
	return nil, errs.NewUpstreamError("webhook_redirect_405", on405.message, on405.detail)
}

func resolve(base, location string) (string, error) {
	if strings.HasPrefix(location, "http") {
		return location, nil
	}
	b, err := url.Parse(base)
	if err != nil {
		return "", err
	}
	l, err := url.Parse(location)
	if err != nil {
		return "", err
	}
	return b.ResolveReference(l).String(), nil
}

func (g *gasWebhook) do(ctx context.Context, c *http.Client, method, target string, body []byte) (int, string, error) {
	var r io.Reader
	if body != nil {
		r = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, target, r)
	if err != nil {
		return 0, "", err
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := c.Do(req)
	if err != nil {
		return 0, "", err
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	return res.StatusCode, string(b), nil
}
