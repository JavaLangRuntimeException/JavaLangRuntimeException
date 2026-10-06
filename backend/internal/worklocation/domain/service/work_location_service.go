package service

import (
	"context"
	"errors"
	"sort"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/worklocation/domain/entity"
	"github.com/javalangruntimeexception/taramanji/backend/internal/worklocation/domain/repository"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/jst"
)

const (
	// Undecided は未登録の日に自動で入れる場所名
	Undecided = "未定（お問い合わせください）"
	// Unavailable の日は予約を受け付けない（reservation が参照する）
	Unavailable = "対応不可日・休日"
	// publishMonths は「最短 2 ヶ月先まで公開」
	publishMonths = 2
)

type WorkLocationService struct {
	repo  repository.WorkLocationRepository
	clock func() time.Time
}

func NewWorkLocationService(repo repository.WorkLocationRepository, clock func() time.Time) *WorkLocationService {
	if clock == nil {
		clock = time.Now
	}
	return &WorkLocationService{repo: repo, clock: clock}
}

// ListPublished は過去の日を消し、今日から 2 ヶ月先まで未登録の日を Undecided で埋めて返す。
func (s *WorkLocationService) ListPublished(ctx context.Context) (map[string]string, error) {
	all, err := s.repo.SelectAll(ctx)
	if err != nil {
		return nil, err
	}
	now := s.clock()
	today := jst.Date(now)
	out := map[string]string{}
	var past []string
	for _, wl := range all {
		if wl.Date < today {
			past = append(past, wl.Date)
			continue
		}
		out[wl.Date] = wl.Location
	}
	if len(past) > 0 {
		if err := s.repo.BulkDelete(ctx, past); err != nil && !errors.Is(err, repository.ErrWorkLocationNotFound) {
			return nil, err
		}
	}

	// JS の setMonth(+2) と同じく、月末の繰り越しも Go の AddDate と一致する
	last := jst.Date(now.In(jst.Location).AddDate(0, publishMonths, 0))
	var fill []*entity.WorkLocation
	for d := now.In(jst.Location); jst.Date(d) <= last; d = d.AddDate(0, 0, 1) {
		date := jst.Date(d)
		if _, ok := out[date]; ok {
			continue
		}
		wl, err := entity.NewWorkLocation(date, Undecided)
		if err != nil {
			return nil, err
		}
		fill = append(fill, wl)
		out[date] = Undecided
	}
	if len(fill) > 0 {
		if err := s.repo.BulkUpsert(ctx, fill); err != nil {
			return nil, err
		}
	}
	return out, nil
}

// Set は複数日にまとめて場所を登録する（既存は上書き）。
func (s *WorkLocationService) Set(ctx context.Context, dates []string, location string) (int, error) {
	items := make([]*entity.WorkLocation, 0, len(dates))
	seen := map[string]bool{}
	for _, d := range dates {
		if seen[d] {
			continue
		}
		seen[d] = true
		wl, err := entity.NewWorkLocation(d, location)
		if err != nil {
			return 0, err
		}
		items = append(items, wl)
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Date < items[j].Date })
	if err := s.repo.BulkUpsert(ctx, items); err != nil {
		return 0, err
	}
	return len(dates), nil
}

// Delete は 1 日分を消す。登録がなくても成功とする（旧 API と同じ）。
func (s *WorkLocationService) Delete(ctx context.Context, date string) error {
	if err := s.repo.Delete(ctx, date); err != nil && !errors.Is(err, repository.ErrWorkLocationNotFound) {
		return err
	}
	return nil
}

// Get は 1 日分（未登録なら空）。
func (s *WorkLocationService) Get(ctx context.Context, date string) (string, error) {
	wl, err := s.repo.SelectByPK(ctx, date)
	if err != nil || wl == nil {
		return "", err
	}
	return wl.Location, nil
}
