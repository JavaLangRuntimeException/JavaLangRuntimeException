package ratelimit

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"connectrpc.com/connect"

	v1 "github.com/javalangruntimeexception/taramanji/backend/gen/taramanji/inquiry/v1"
	"github.com/javalangruntimeexception/taramanji/backend/gen/taramanji/inquiry/v1/inquiryv1connect"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/errs"
)

func TestAllow(t *testing.T) {
	now := time.Date(2026, 11, 2, 0, 0, 0, 0, time.UTC)
	l := newLimiter(nil, func() time.Time { return now })
	rule := Rule{Burst: 2, Every: time.Minute}
	a := key{procedure: "/p", ip: "198.51.100.1"}
	b := key{procedure: "/p", ip: "198.51.100.2"}

	if !l.allow(a, rule) || !l.allow(a, rule) {
		t.Fatal("Burst 回までは通す")
	}
	if l.allow(a, rule) {
		t.Fatal("Burst を超えたら止める")
	}
	if !l.allow(b, rule) {
		t.Fatal("別の IP は別に数える")
	}
	if !l.allow(key{procedure: "/q", ip: a.ip}, rule) {
		t.Fatal("別の RPC は別に数える")
	}
	now = now.Add(time.Minute)
	if !l.allow(a, rule) || l.allow(a, rule) {
		t.Fatal("Every ごとに 1 回だけ回復する")
	}
}

func TestSweep(t *testing.T) {
	now := time.Date(2026, 11, 2, 0, 0, 0, 0, time.UTC)
	l := newLimiter(nil, func() time.Time { return now })
	rule := Rule{Burst: 1, Every: time.Minute}
	l.allow(key{procedure: "/p", ip: "198.51.100.1"}, rule)
	now = now.Add(idleTTL)
	l.allow(key{procedure: "/p", ip: "198.51.100.2"}, rule)
	if len(l.entries) != 1 {
		t.Fatalf("しばらく来ていない利用者は捨てる: %d", len(l.entries))
	}
}

type stubInquiry struct {
	inquiryv1connect.UnimplementedInquiryServiceHandler
}

func (stubInquiry) SubmitContact(context.Context, *connect.Request[v1.SubmitContactRequest]) (*connect.Response[v1.SubmitContactResponse], error) {
	return connect.NewResponse(&v1.SubmitContactResponse{}), nil
}

func (stubInquiry) SubmitQuestionnaire(context.Context, *connect.Request[v1.SubmitQuestionnaireRequest]) (*connect.Response[v1.SubmitQuestionnaireResponse], error) {
	return connect.NewResponse(&v1.SubmitQuestionnaireResponse{}), nil
}

func TestInterceptor(t *testing.T) {
	rules := map[string]Rule{inquiryv1connect.InquiryServiceSubmitContactProcedure: {Burst: 1, Every: time.Hour}}
	path, h := inquiryv1connect.NewInquiryServiceHandler(stubInquiry{}, connect.WithInterceptors(Interceptor(rules)))
	mux := http.NewServeMux()
	mux.Handle(path, h)
	srv := httptest.NewServer(mux)
	defer srv.Close()
	client := inquiryv1connect.NewInquiryServiceClient(srv.Client(), srv.URL)

	contact := func(ip string) error {
		req := connect.NewRequest(&v1.SubmitContactRequest{})
		req.Header().Set(ClientIPHeader, ip)
		_, err := client.SubmitContact(context.Background(), req)
		return err
	}
	if err := contact("198.51.100.1"); err != nil {
		t.Fatal(err)
	}
	err := contact("198.51.100.1")
	var ce *connect.Error
	if !errors.As(err, &ce) || ce.Code() != connect.CodeResourceExhausted || ce.Meta().Get(errs.ErrorCodeHeader) != "rate_limited" {
		t.Fatalf("2 回目は rate_limited: %v", err)
	}
	if err := contact("198.51.100.2"); err != nil {
		t.Fatalf("別の IP は通す: %v", err)
	}
	// rules にない RPC は制限しない
	for range 3 {
		if _, err := client.SubmitQuestionnaire(context.Background(), connect.NewRequest(&v1.SubmitQuestionnaireRequest{})); err != nil {
			t.Fatal(err)
		}
	}
}
