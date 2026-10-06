package gateway

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/content/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/httpx"
)

type orcidClient struct{ client *http.Client }

func NewOrcid() gateway.Orcid { return &orcidClient{client: httpx.New(20 * time.Second)} }

type orcidValue struct {
	Value string `json:"value"`
}

type orcidSummary struct {
	PutCode int64 `json:"put-code"`
	Title   *struct {
		Title *orcidValue `json:"title"`
	} `json:"title"`
	ExternalIDs *struct {
		ExternalID []struct {
			Type  string `json:"external-id-type"`
			Value string `json:"external-id-value"`
		} `json:"external-id"`
	} `json:"external-ids"`
	URL             *orcidValue `json:"url"`
	Type            string      `json:"type"`
	PublicationDate *struct {
		Year  *orcidValue `json:"year"`
		Month *orcidValue `json:"month"`
		Day   *orcidValue `json:"day"`
	} `json:"publication-date"`
	JournalTitle *orcidValue `json:"journal-title"`
}

type orcidDetail struct {
	PutCode      int64 `json:"put-code"`
	Contributors *struct {
		Contributor []struct {
			CreditName *orcidValue `json:"credit-name"`
		} `json:"contributor"`
	} `json:"contributors"`
}

func (o *orcidClient) get(ctx context.Context, url string, v any) error {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	req.Header.Set("Accept", "application/json")
	res, err := o.client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("ORCID API error: %d", res.StatusCode)
	}
	return json.NewDecoder(res.Body).Decode(v)
}

// Works は旧 /api/orcid と同じ規則で 1 論文 1 件にまとめる
func (o *orcidClient) Works(ctx context.Context, id string) ([]gateway.OrcidWork, error) {
	base := "https://pub.orcid.org/v3.0/" + id
	var works struct {
		Group []struct {
			Summary []orcidSummary `json:"work-summary"`
		} `json:"group"`
	}
	if err := o.get(ctx, base+"/works", &works); err != nil {
		return nil, err
	}
	var groups [][]orcidSummary
	var putCodes []string
	for _, g := range works.Group {
		if len(g.Summary) == 0 {
			continue
		}
		groups = append(groups, g.Summary)
		for _, s := range g.Summary {
			putCodes = append(putCodes, strconv.FormatInt(s.PutCode, 10))
		}
	}
	details := map[int64]orcidDetail{}
	for i := 0; i < len(putCodes); i += 100 {
		var bulk struct {
			Bulk []struct {
				Work *orcidDetail `json:"work"`
			} `json:"bulk"`
		}
		if err := o.get(ctx, base+"/works/"+strings.Join(putCodes[i:min(i+100, len(putCodes))], ","), &bulk); err != nil {
			return nil, err
		}
		for _, b := range bulk.Bulk {
			if b.Work != nil {
				details[b.Work.PutCode] = *b.Work
			}
		}
	}
	var out []gateway.OrcidWork
	for _, summaries := range groups {
		primary := summaries[0]
		pick := func(get func(orcidSummary) string) string {
			for _, s := range summaries {
				if v := get(s); v != "" {
					return v
				}
			}
			return ""
		}
		w := gateway.OrcidWork{PutCode: primary.PutCode, Type: primary.Type}
		w.Title = pick(func(s orcidSummary) string {
			if s.Title != nil && s.Title.Title != nil {
				return s.Title.Title.Value
			}
			return ""
		})
		w.Venue = pick(func(s orcidSummary) string {
			if s.JournalTitle != nil {
				return s.JournalTitle.Value
			}
			return ""
		})
		w.DOI = pick(func(s orcidSummary) string {
			if s.ExternalIDs != nil {
				for _, e := range s.ExternalIDs.ExternalID {
					if e.Type == "doi" && e.Value != "" {
						return e.Value
					}
				}
			}
			return ""
		})
		if w.DOI != "" {
			w.URL = "https://doi.org/" + w.DOI
		} else {
			w.URL = pick(func(s orcidSummary) string {
				if s.URL != nil {
					return s.URL.Value
				}
				return ""
			})
		}
		if d := primary.PublicationDate; d != nil {
			var parts []string
			for _, p := range []*orcidValue{d.Year, d.Month, d.Day} {
				if p != nil && p.Value != "" {
					parts = append(parts, p.Value)
				}
			}
			w.Date = strings.Join(parts, "-")
		}
		// 著者は、詳細の著者が一番多いサマリーのものを使う
		var best []string
		bestCount := 0
		for _, s := range summaries {
			d, ok := details[s.PutCode]
			if !ok || d.Contributors == nil || len(d.Contributors.Contributor) <= bestCount {
				continue
			}
			bestCount = len(d.Contributors.Contributor)
			best = nil
			for _, c := range d.Contributors.Contributor {
				if c.CreditName != nil && c.CreditName.Value != "" {
					best = append(best, c.CreditName.Value)
				}
			}
		}
		w.Authors = best
		if w.Title != "" {
			out = append(out, w)
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Date > out[j].Date })
	return out, nil
}
