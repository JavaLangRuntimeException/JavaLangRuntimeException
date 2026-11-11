package invoker

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync"
	"testing"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
)

// fakeScaler は 1 台にすると readyAfter 回目の確認で Ready になる
type fakeScaler struct {
	mu         sync.Mutex
	fns        map[string]*gateway.FunctionState
	polls      int
	readyAfter int
	scales     []int32
}

func (f *fakeScaler) Function(_ context.Context, name string) (gateway.FunctionState, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	s, ok := f.fns[name]
	if !ok {
		return gateway.FunctionState{}, gateway.ErrFunctionNotFound
	}
	if s.Replicas > 0 && s.Ready == 0 {
		if f.polls++; f.polls >= f.readyAfter {
			s.Ready = 1
		}
	}
	return *s, nil
}

func (f *fakeScaler) Running(context.Context) ([]gateway.FunctionState, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := []gateway.FunctionState{}
	for _, s := range f.fns {
		if s.Replicas > 0 {
			out = append(out, *s)
		}
	}
	return out, nil
}

func (f *fakeScaler) Scale(_ context.Context, name string, n int32) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	s, ok := f.fns[name]
	if !ok {
		return gateway.ErrFunctionNotFound
	}
	s.Replicas, s.Ready = n, 0
	f.scales = append(f.scales, n)
	return nil
}

func (f *fakeScaler) Touch(_ context.Context, name string, at time.Time) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if s, ok := f.fns[name]; ok {
		s.LastRequest = at
	}
	return nil
}

func setup(t *testing.T) (*Invoker, *fakeScaler, *time.Time) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Cloud-Function") != "" {
			t.Error("関数には X-Cloud-Function を渡さない")
		}
		_, _ = io.WriteString(w, "host="+r.Host+" path="+r.URL.Path)
	}))
	t.Cleanup(upstream.Close)
	u, _ := url.Parse(upstream.URL)
	sc := &fakeScaler{fns: map[string]*gateway.FunctionState{"blog": {Name: "blog"}}, readyAfter: 2}
	now := time.Date(2026, 11, 11, 0, 0, 0, 0, time.UTC)
	inv := New(Config{Scaler: sc, Upstream: func(string) *url.URL { return u }, IdleTimeout: 5 * time.Minute,
		ColdStartTimeout: 5 * time.Second, Clock: func() time.Time { return now }})
	return inv, sc, &now
}

func call(inv *Invoker, fn string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, "https://blog-cloud.taramanji.com/hello", nil)
	if fn != "" {
		req.Header.Set("X-Cloud-Function", fn)
	}
	rec := httptest.NewRecorder()
	inv.ServeHTTP(rec, req)
	return rec
}

func TestColdStartAndProxy(t *testing.T) {
	inv, sc, _ := setup(t)
	// 0 台の関数に同時に来ても、起こすのは 1 回だけ
	var wg sync.WaitGroup
	for range 3 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if rec := call(inv, "blog"); rec.Code != 200 || rec.Body.String() != "host=blog-cloud.taramanji.com path=/hello" {
				t.Errorf("got %d %q", rec.Code, rec.Body.String())
			}
		}()
	}
	wg.Wait()
	if len(sc.scales) != 1 || sc.scales[0] != 1 {
		t.Fatalf("起こすのは 1 回: %v", sc.scales)
	}
	// 起きているあいだは台数を確かめ直さない
	polls := sc.polls
	if rec := call(inv, "blog"); rec.Code != 200 || sc.polls != polls {
		t.Fatalf("warm: %d polls %d→%d", rec.Code, polls, sc.polls)
	}
}

func TestRejectsUnroutedAndUnknown(t *testing.T) {
	inv, _, _ := setup(t)
	if rec := call(inv, ""); rec.Code != http.StatusNotFound {
		t.Fatalf("API を通っていない: %d", rec.Code)
	}
	if rec := call(inv, "../etc"); rec.Code != http.StatusNotFound {
		t.Fatalf("名前でないもの: %d", rec.Code)
	}
	if rec := call(inv, "none"); rec.Code != http.StatusNotFound {
		t.Fatalf("ない関数: %d", rec.Code)
	}
}

func TestSweepScalesIdleFunctionsToZero(t *testing.T) {
	inv, sc, now := setup(t)
	if rec := call(inv, "blog"); rec.Code != 200 {
		t.Fatal(rec.Code)
	}
	ctx := context.Background()
	*now = now.Add(4 * time.Minute)
	if err := inv.Sweep(ctx); err != nil || sc.fns["blog"].Replicas != 1 {
		t.Fatalf("まだ寝かせない: %v", err)
	}
	// ほかの Pod が最近リクエストを受けていたら寝かせない
	*now = now.Add(2 * time.Minute)
	sc.fns["blog"].LastRequest = now.Add(-time.Minute)
	if err := inv.Sweep(ctx); err != nil || sc.fns["blog"].Replicas != 1 {
		t.Fatalf("ほかの Pod が使っている: %v", err)
	}
	*now = now.Add(5 * time.Minute)
	if err := inv.Sweep(ctx); err != nil || sc.fns["blog"].Replicas != 0 {
		t.Fatalf("5 分来なければ 0 台: %v replicas=%d", err, sc.fns["blog"].Replicas)
	}
	// 寝かせたあとのリクエストで、もう一度起こす
	sc.polls = 0
	if rec := call(inv, "blog"); rec.Code != 200 || sc.fns["blog"].Replicas != 1 {
		t.Fatalf("起こし直す: %d", rec.Code)
	}
	// 起動直後に初めて見た関数は、その時点から数える
	sc.fns["fresh"] = &gateway.FunctionState{Name: "fresh", Replicas: 1, Ready: 1}
	if err := inv.Sweep(ctx); err != nil || sc.fns["fresh"].Replicas != 1 {
		t.Fatalf("初めて見た関数はすぐ寝かせない: %v", err)
	}
}
