package gateway

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/httpx"
)

// datadogMonitors は Datadog の Monitors API（v1）。アプリケーションキーに monitors_read・monitors_write が要る
type datadogMonitors struct {
	http   *http.Client
	site   string
	apiKey string
	appKey string
}

// NewDatadogMonitors の site は https://api.us5.datadoghq.com など
func NewDatadogMonitors(site, apiKey, appKey string) gateway.Monitors {
	return &datadogMonitors{http: httpx.New(20 * time.Second), site: site, apiKey: apiKey, appKey: appKey}
}

type monitorBody struct {
	ID      int64          `json:"id,omitempty"`
	Name    string         `json:"name"`
	Type    string         `json:"type"`
	Query   string         `json:"query"`
	Message string         `json:"message"`
	Tags    []string       `json:"tags"`
	Options map[string]any `json:"options,omitempty"`
}

func (d *datadogMonitors) do(ctx context.Context, method, path string, in, out any) error {
	var body io.Reader
	if in != nil {
		b, err := json.Marshal(in)
		if err != nil {
			return err
		}
		body = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, d.site+path, body)
	if err != nil {
		return err
	}
	req.Header.Set("DD-API-KEY", d.apiKey)
	req.Header.Set("DD-APPLICATION-KEY", d.appKey)
	if in != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := d.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(res.Body, 16<<20))
	if res.StatusCode != http.StatusOK {
		if len(b) > 300 {
			b = b[:300]
		}
		return fmt.Errorf("datadog %s %s: HTTP %d: %s", method, path, res.StatusCode, b)
	}
	if out == nil {
		return nil
	}
	return json.Unmarshal(b, out)
}

func (d *datadogMonitors) List(ctx context.Context, tags []string) ([]gateway.Monitor, error) {
	out := []gateway.Monitor{}
	// 1 ページ 100 件。足りなくなるまで読む
	for page := 0; ; page++ {
		q := url.Values{"monitor_tags": {strings.Join(tags, ",")}, "page": {strconv.Itoa(page)}, "page_size": {"100"}}
		var list []monitorBody
		if err := d.do(ctx, http.MethodGet, "/api/v1/monitor?"+q.Encode(), nil, &list); err != nil {
			return nil, err
		}
		for _, m := range list {
			out = append(out, gateway.Monitor{ID: m.ID, Name: m.Name, Query: m.Query, Message: m.Message, Tags: m.Tags})
		}
		if len(list) < 100 {
			return out, nil
		}
	}
}

func body(m gateway.Monitor) monitorBody {
	return monitorBody{Name: m.Name, Type: "query alert", Query: m.Query, Message: m.Message, Tags: m.Tags,
		// データがない（アプリを止めている）ときは知らせない。戻ったら自動で解決する
		Options: map[string]any{"notify_no_data": false, "require_full_window": false, "include_tags": false}}
}

func (d *datadogMonitors) Create(ctx context.Context, m gateway.Monitor) error {
	return d.do(ctx, http.MethodPost, "/api/v1/monitor", body(m), nil)
}

func (d *datadogMonitors) Update(ctx context.Context, m gateway.Monitor) error {
	return d.do(ctx, http.MethodPut, "/api/v1/monitor/"+strconv.FormatInt(m.ID, 10), body(m), nil)
}

func (d *datadogMonitors) Delete(ctx context.Context, id int64) error {
	return d.do(ctx, http.MethodDelete, "/api/v1/monitor/"+strconv.FormatInt(id, 10), nil, nil)
}
