package gateway

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/reservation/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/errs"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/jst"
)

// fakeGAS は GAS のウェブアプリの振る舞いを再現する。exec が最初の POST、echo が転送先
type fakeGAS struct {
	exec, echoPost, echoGet http.HandlerFunc
	payloads                []map[string]any
}

func (f *fakeGAS) server(t *testing.T) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/exec":
			b, _ := io.ReadAll(r.Body)
			var p map[string]any
			_ = json.Unmarshal(b, &p)
			f.payloads = append(f.payloads, p)
			f.exec(w, r)
		case r.URL.Path == "/echo" && r.Method == http.MethodPost && f.echoPost != nil:
			f.echoPost(w, r)
		case r.URL.Path == "/echo" && r.Method == http.MethodGet && f.echoGet != nil:
			f.echoGet(w, r)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	}))
}

func redirectTo(path, body string) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		if path != "" {
			w.Header().Set("Location", path)
		}
		w.WriteHeader(http.StatusFound)
		_, _ = io.WriteString(w, body)
	}
}

func reply(status int, body string) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(status)
		_, _ = io.WriteString(w, body)
	}
}

func sampleEvent() gateway.Event {
	start := time.Date(2026, 10, 7, 10, 0, 0, 0, jst.Location)
	return gateway.Event{Summary: "S", Description: "D", Start: start, End: start.Add(time.Hour),
		Attendees: []string{"a@example.com"}, CreateMeet: true, ContactMethod: "meet"}
}

func errCode(err error) string {
	if de, ok := errs.As(err); ok {
		return de.Code
	}
	return ""
}

const okJSON = `{"ok":true,"eventId":"ev1","htmlLink":"https://cal/ev1","meetLink":"https://meet/x"}`

func TestGasCreate(t *testing.T) {
	cases := []struct {
		name     string
		f        fakeGAS
		wantID   string
		wantCode string
	}{
		{"そのまま 200", fakeGAS{exec: reply(200, okJSON)}, "ev1", ""},
		{"302 の本文に結果", fakeGAS{exec: redirectTo("/echo", okJSON)}, "ev1", ""},
		{"転送先へ POST", fakeGAS{exec: redirectTo("/echo", "<html>moved</html>"), echoPost: reply(200, okJSON)}, "ev1", ""},
		{"転送先は 405 → GET（本番の経路）", fakeGAS{exec: redirectTo("/echo", ""), echoGet: reply(200, okJSON)}, "ev1", ""},
		{"GET が ok:false", fakeGAS{exec: redirectTo("/echo", ""), echoGet: reply(200, `{"ok":false,"error":"busy","message":"m"}`)}, "", "busy"},
		{"GET も読めない", fakeGAS{exec: redirectTo("/echo", ""), echoGet: reply(200, "<html/>")}, "", "webhook_redirect_405"},
		{"転送先がエラー", fakeGAS{exec: redirectTo("/echo", ""), echoPost: reply(500, "boom")}, "", "webhook_failed"},
		{"Location なし・本文なし", fakeGAS{exec: redirectTo("", "")}, "", "webhook_redirect_no_location"},
		{"500", fakeGAS{exec: reply(500, "err")}, "", "webhook_failed"},
		{"JSON でない", fakeGAS{exec: reply(200, "<html/>")}, "", "webhook_unexpected_response"},
		{"ok:false", fakeGAS{exec: reply(200, `{"ok":false}`)}, "", "webhook_returned_error"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			srv := c.f.server(t)
			defer srv.Close()
			got, err := NewGasWebhook(srv.URL+"/exec", "cal", "owner@example.com").Create(context.Background(), sampleEvent())
			if c.wantCode != "" {
				if errCode(err) != c.wantCode {
					t.Fatalf("err = %v, want code %s", err, c.wantCode)
				}
				return
			}
			if err != nil || got.EventID != c.wantID || got.MeetLink != "https://meet/x" {
				t.Fatalf("got %+v, %v", got, err)
			}
		})
	}
}

func TestGasCreatePayload(t *testing.T) {
	f := fakeGAS{exec: reply(200, okJSON)}
	srv := f.server(t)
	defer srv.Close()
	if _, err := NewGasWebhook(srv.URL+"/exec", "cal", "owner@example.com").Create(context.Background(), sampleEvent()); err != nil {
		t.Fatal(err)
	}
	b, _ := json.Marshal(f.payloads[0])
	want := `{"attendees":[{"email":"a@example.com"}],"calendarId":"cal","contactMethod":"meet","createMeet":true,"description":"D",` +
		`"end":{"dateTime":"2026-10-07T11:00:00","timeZone":"Asia/Tokyo"},"ownerEmail":"owner@example.com",` +
		`"start":{"dateTime":"2026-10-07T10:00:00","timeZone":"Asia/Tokyo"},"summary":"S"}`
	if string(b) != want {
		t.Fatalf("payload\n%s\nwant\n%s", b, want)
	}
}

func TestGasCreateRedirectUnreachable(t *testing.T) {
	// 転送先に届かなくても GAS は予定を作っているので成功扱い（旧 API と同じ）
	f := fakeGAS{exec: redirectTo("http://127.0.0.1:1/echo", "")}
	srv := f.server(t)
	defer srv.Close()
	got, err := NewGasWebhook(srv.URL+"/exec", "cal", "").Create(context.Background(), sampleEvent())
	if err != nil || got.EventID != "" || got.Note != redirectErrorNote {
		t.Fatalf("got %+v, %v", got, err)
	}
}

func TestGasDelete(t *testing.T) {
	f := fakeGAS{exec: redirectTo("/echo", ""), echoGet: reply(200, `{"ok":true}`)}
	srv := f.server(t)
	defer srv.Close()
	deleted, err := NewGasWebhook(srv.URL+"/exec", "cal", "").Delete(context.Background(), "ev1")
	if err != nil || !deleted {
		t.Fatalf("deleted=%v err=%v", deleted, err)
	}
	if f.payloads[0]["action"] != "delete" || f.payloads[0]["eventId"] != "ev1" {
		t.Fatalf("payload %v", f.payloads[0])
	}

	f2 := fakeGAS{exec: redirectTo("/echo", ""), echoGet: reply(500, `{"ok":true}`)}
	srv2 := f2.server(t)
	defer srv2.Close()
	_, err = NewGasWebhook(srv2.URL+"/exec", "cal", "").Delete(context.Background(), "ev1")
	if de, _ := errs.As(err); de == nil || de.Code != "webhook_redirect_405" || !strings.Contains(de.Detail, "最新バージョン") {
		t.Fatalf("err = %v", err)
	}

	f3 := fakeGAS{exec: redirectTo("http://127.0.0.1:1/echo", "")}
	srv3 := f3.server(t)
	defer srv3.Close()
	if _, err = NewGasWebhook(srv3.URL+"/exec", "cal", "").Delete(context.Background(), "ev1"); errCode(err) != "webhook_redirect_error" {
		t.Fatalf("err = %v", err)
	}
}

func TestGasGetFollowsRedirectAsGET(t *testing.T) {
	f := fakeGAS{exec: redirectTo("/echo", ""), echoGet: reply(200, okJSON)}
	srv := f.server(t)
	defer srv.Close()
	got, err := NewGasWebhook(srv.URL+"/exec", "cal", "").Get(context.Background(), "ev1")
	if err != nil || got.HTMLLink != "https://cal/ev1" {
		t.Fatalf("got %+v, %v", got, err)
	}
}
