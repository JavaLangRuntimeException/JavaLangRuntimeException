//go:build live

package usecase

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/reservation/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/reservation/domain/service"
	infragw "github.com/javalangruntimeexception/taramanji/backend/internal/reservation/infra/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/jst"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/observability"
)

// 本番の /api/ical/busy と結果を比べる（ICAL_URLS が必要）:
//
//	ICAL_URLS=... go test -tags live -run TestLiveBusyParity ./internal/reservation/usecase/
//
// 既知の差分（意図した修正）: 旧実装は RRULE の COUNT を無視し、BYDAY を UTC の曜日で数えていた。
// そのため 2017 年の COUNT=1 の予定（08:30〜12:30）が毎週 水・木・金に出ていたが、新しい実装では出ない。
func TestLiveBusyParity(t *testing.T) {
	var sources []gateway.IcalSource
	for _, u := range strings.Split(os.Getenv("ICAL_URLS"), ",") {
		if u = strings.TrimSpace(u); u != "" {
			sources = append(sources, gateway.IcalSource{URL: strings.Replace(u, "webcal://", "https://", 1)})
		}
	}
	if len(sources) == 0 {
		t.Skip("ICAL_URLS is not set")
	}
	uc := NewReservationUsecase(Config{Ical: service.NewIcsParser(540), Sources: sources}, nil, infragw.NewIcalFetcher(), nil, observability.Noop{})
	monday := service.WeekStart("", time.Now())
	for w := 0; w < 6; w++ {
		from := monday.AddDate(0, 0, 7*w)
		iso := service.FormatISO(from)
		body, _ := json.Marshal(map[string]string{"weekStartISO": iso})
		res, err := http.Post("https://taramanji.com/api/ical/busy", "application/json", bytes.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		var prod struct{ Busy []Interval }
		_ = json.NewDecoder(res.Body).Decode(&prod)
		res.Body.Close()
		mine, _ := uc.GetBusy(context.Background(), GetBusyInput{WeekStartIso: iso})
		a, b := flat(prod.Busy), flat(deref(mine.Busy))
		if a != b {
			t.Errorf("week %s differs\nprod: %s\nnew:  %s", from.In(jst.Location).Format("01/02"), a, b)
		} else {
			t.Logf("week %s: %d intervals match", from.In(jst.Location).Format("01/02"), len(prod.Busy))
		}
	}
}

func deref(l []*Interval) []Interval {
	var out []Interval
	for _, v := range l {
		out = append(out, *v)
	}
	return out
}

func flat(l []Interval) string {
	var s []string
	for _, v := range l {
		s = append(s, v.Start+"/"+v.End)
	}
	return strings.Join(s, " ")
}
