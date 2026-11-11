package gateway

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/httpx"
)

// datadog は Datadog の Metrics API（v1 /query）。API キーとアプリケーションキー（metrics_read だけの権限）を使う
type datadog struct {
	http   *http.Client
	site   string
	apiKey string
	appKey string
}

// NewDatadog の site は https://api.us5.datadoghq.com など
func NewDatadog(site, apiKey, appKey string) gateway.Metrics {
	return &datadog{http: httpx.New(20 * time.Second), site: site, apiKey: apiKey, appKey: appKey}
}

type queryResponse struct {
	Status string `json:"status"`
	Error  string `json:"error"`
	Series []struct {
		TagSet    []string      `json:"tag_set"`
		Pointlist [][2]*float64 `json:"pointlist"`
	} `json:"series"`
}

func (d *datadog) Query(ctx context.Context, query string, from, to time.Time) ([]gateway.Series, error) {
	q := url.Values{"from": {strconv.FormatInt(from.Unix(), 10)}, "to": {strconv.FormatInt(to.Unix(), 10)}, "query": {query}}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, d.site+"/api/v1/query?"+q.Encode(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("DD-API-KEY", d.apiKey)
	req.Header.Set("DD-APPLICATION-KEY", d.appKey)
	res, err := d.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 16<<20))
	if res.StatusCode != http.StatusOK {
		if len(body) > 300 {
			body = body[:300]
		}
		return nil, fmt.Errorf("datadog query: HTTP %d: %s", res.StatusCode, body)
	}
	var r queryResponse
	if err := json.Unmarshal(body, &r); err != nil {
		return nil, err
	}
	if r.Status == "error" {
		return nil, fmt.Errorf("datadog query: %s", r.Error)
	}
	out := make([]gateway.Series, 0, len(r.Series))
	for _, s := range r.Series {
		g := gateway.Series{Tags: s.TagSet}
		for _, p := range s.Pointlist {
			// 値がない点（null）と、0 で割った点（5xx の割合でリクエストがない時間）は飛ばす
			if p[0] == nil || p[1] == nil || math.IsNaN(*p[1]) || math.IsInf(*p[1], 0) {
				continue
			}
			g.TimestampsMs = append(g.TimestampsMs, int64(*p[0]))
			g.Values = append(g.Values, *p[1])
		}
		out = append(out, g)
	}
	return out, nil
}
