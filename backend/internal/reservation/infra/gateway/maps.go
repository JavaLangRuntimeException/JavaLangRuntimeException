package gateway

import (
	"context"
	"errors"
	"io"
	"net/http"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/reservation/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/reservation/domain/service"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/httpx"
)

// ErrNotMaps は Google マップ以外の URL（転送先を含む）
var ErrNotMaps = errors.New("not a Google Maps URL")

type mapsFetcher struct{ client *http.Client }

// NewMapsFetcher は転送を 1 回ごとに確かめ、Google マップの外へは出ない
func NewMapsFetcher() gateway.MapsFetcher {
	c := httpx.New(10 * time.Second)
	c.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		if len(via) >= 10 {
			return errors.New("too many redirects")
		}
		if !service.IsMapsURL(req.URL) {
			return ErrNotMaps
		}
		return nil
	}
	return &mapsFetcher{client: c}
}

func (f *mapsFetcher) Fetch(ctx context.Context, url string) (*gateway.Page, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	if !service.IsMapsURL(req.URL) {
		return nil, ErrNotMaps
	}
	req.Header.Set("User-Agent", icalUA)
	res, err := f.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(res.Body, 2<<20))
	return &gateway.Page{FinalURL: res.Request.URL.String(), HTML: string(b)}, nil
}
