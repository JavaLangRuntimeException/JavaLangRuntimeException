package invoker

import (
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
)

// 0 台から起こしたとき、Pod が Ready になってもアプリがまだ待ち受けていないことがある。待ち受けを始めるまで待ってから渡す（502 にしない）
func TestColdStartWaitsUntilListening(t *testing.T) {
	// ポートだけ決めて、待ち受けはあとで始める
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	addr := ln.Addr().String()
	_ = ln.Close()
	go func() {
		time.Sleep(700 * time.Millisecond)
		l, err := net.Listen("tcp", addr)
		if err != nil {
			t.Error(err)
			return
		}
		srv := &httptest.Server{Listener: l, Config: &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			body, _ := io.ReadAll(r.Body)
			_, _ = w.Write(append([]byte("got "), body...))
		})}}
		srv.Start()
		t.Cleanup(srv.Close)
	}()
	u, _ := url.Parse("http://" + addr)
	// Ready にはすぐなる（readinessProbe のない関数と同じ）
	sc := &fakeScaler{fns: map[string]*gateway.FunctionState{"api": {Name: "api"}}, readyAfter: 1}
	inv := New(Config{Scaler: sc, Upstream: func(string) *url.URL { return u }, IdleTimeout: time.Minute, ColdStartTimeout: 5 * time.Second})
	// 本文のある POST でも、やり直さずに届く
	req := httptest.NewRequest(http.MethodPost, "https://x-apigw-cloud.taramanji.com/api/warm", stringsReader("hello"))
	req.Header.Set("X-Cloud-Function", "api")
	rec := httptest.NewRecorder()
	inv.ServeHTTP(rec, req)
	if rec.Code != 200 || rec.Body.String() != "got hello" {
		t.Fatalf("%d %q", rec.Code, rec.Body.String())
	}
}

func stringsReader(s string) io.Reader { return &onceReader{s: s} }

type onceReader struct {
	s    string
	done bool
}

func (r *onceReader) Read(p []byte) (int, error) {
	if r.done {
		return 0, io.EOF
	}
	r.done = true
	return copy(p, r.s), nil
}
