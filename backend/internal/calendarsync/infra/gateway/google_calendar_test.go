package gateway

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/calendarsync/domain/gateway"
)

// fakeAPI は Calendar API の予定 1 件分の作成・更新・削除を真似る
type fakeAPI struct {
	mu       sync.Mutex
	calls    []string
	existing map[string]bool
	failures []int // 先頭から順に返すエラー（0 なら通常処理）
}

func (f *fakeAPI) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, r.Method)
	if len(f.failures) > 0 {
		code := f.failures[0]
		f.failures = f.failures[1:]
		if code != 0 {
			w.WriteHeader(code)
			if code == 403 {
				_, _ = io.WriteString(w, `{"error":{"errors":[{"reason":"rateLimitExceeded"}]}}`)
			}
			return
		}
	}
	id := r.URL.Path[strings.LastIndex(r.URL.Path, "/")+1:]
	switch r.Method {
	case http.MethodGet:
		_ = json.NewEncoder(w).Encode(map[string]any{"items": []map[string]any{{"id": "e1", "status": "confirmed",
			"start": map[string]string{"dateTime": "2026-10-02T10:00:00+09:00", "timeZone": "Asia/Tokyo"}, "end": map[string]string{"date": "2026-10-03"}}}})
	case http.MethodPost:
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		if f.existing[body["id"].(string)] {
			w.WriteHeader(http.StatusConflict)
			return
		}
		f.existing[body["id"].(string)] = true
	case http.MethodPut:
		if !f.existing[id] {
			w.WriteHeader(http.StatusNotFound)
		}
	case http.MethodDelete:
		if !f.existing[id] {
			w.WriteHeader(http.StatusGone)
			return
		}
		delete(f.existing, id)
	}
}

func newTestCalendar(t *testing.T, api *fakeAPI) *calendar {
	srv := httptest.NewServer(api)
	t.Cleanup(srv.Close)
	return &calendar{client: client{http: srv.Client(), sleep: func(time.Duration) {}}, id: "a@example.com", base: srv.URL}
}

func TestUpsertBranches(t *testing.T) {
	ctx := context.Background()
	body := gateway.MirrorBody{Summary: "予定あり", Start: gateway.EventTime{"date": "2026-10-02"}, End: gateway.EventTime{"date": "2026-10-03"},
		Transparency: "opaque", Visibility: "private", Marker: map[string]string{"busy_sync_origin": "x:y"}}
	cases := []struct {
		name     string
		existing bool
		isNew    bool
		want     string
	}{
		{"新規は POST だけ", false, true, "POST"},
		{"新規のはずが既にある → 409 → PUT", true, true, "POST,PUT"},
		{"更新は PUT だけ", true, false, "PUT"},
		{"更新のはずが消えている → 404 → POST", false, false, "PUT,POST"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			api := &fakeAPI{existing: map[string]bool{"bid": c.existing}}
			if err := newTestCalendar(t, api).Upsert(ctx, "bid", body, c.isNew); err != nil {
				t.Fatal(err)
			}
			if got := strings.Join(api.calls, ","); got != c.want {
				t.Fatalf("calls %s, want %s", got, c.want)
			}
		})
	}
}

func TestRetryAndErrors(t *testing.T) {
	ctx := context.Background()
	api := &fakeAPI{existing: map[string]bool{}, failures: []int{503, 429, 403}}
	events, err := newTestCalendar(t, api).Events(ctx, time.Now(), time.Now().Add(time.Hour))
	if err != nil || len(events) != 1 || events[0].Start.DateTime() != "2026-10-02T10:00:00+09:00" || events[0].End.Date() != "2026-10-03" {
		t.Fatalf("events %+v %v", events, err)
	}
	if len(api.calls) != 4 {
		t.Fatalf("calls %v", api.calls)
	}
	api2 := &fakeAPI{existing: map[string]bool{}, failures: []int{500, 500, 500, 500, 500}}
	_, err = newTestCalendar(t, api2).Events(ctx, time.Now(), time.Now())
	if err == nil || err.Error() != "Google API HTTP 500: " || len(api2.calls) != 5 {
		t.Fatalf("err %v calls %d", err, len(api2.calls))
	}
	// 削除済み（410）も成功
	if err := newTestCalendar(t, &fakeAPI{existing: map[string]bool{}}).Delete(ctx, "gone"); err != nil {
		t.Fatal(err)
	}
}
