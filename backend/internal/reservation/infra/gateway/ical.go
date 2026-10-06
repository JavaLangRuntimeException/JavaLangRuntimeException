package gateway

import (
	"context"
	"io"
	"net/http"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/reservation/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/httpx"
)

// icalUA は一部のカレンダーがサーバーからの取得を断るため、旧実装と同じくブラウザとして取得する
const icalUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"

type icalFetcher struct{ client *http.Client }

func NewIcalFetcher() gateway.IcalFetcher { return &icalFetcher{client: httpx.New(15 * time.Second)} }

func (f *icalFetcher) Fetch(ctx context.Context, url string) gateway.Fetched {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return gateway.Fetched{}
	}
	req.Header.Set("User-Agent", icalUA)
	req.Header.Set("Accept", "text/calendar, text/plain, */*")
	res, err := f.client.Do(req)
	if err != nil {
		return gateway.Fetched{}
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return gateway.Fetched{Status: res.StatusCode}
	}
	b, err := io.ReadAll(io.LimitReader(res.Body, 20<<20))
	if err != nil {
		return gateway.Fetched{Status: res.StatusCode}
	}
	return gateway.Fetched{OK: true, Status: res.StatusCode, Body: string(b)}
}
