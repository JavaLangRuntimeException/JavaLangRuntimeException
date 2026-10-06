package service

import (
	"context"
	"testing"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/worklocation/domain/entity"
	"github.com/javalangruntimeexception/taramanji/backend/internal/worklocation/domain/repository/mock"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/jst"
)

func TestListPublished_RemovesPastAndFillsTwoMonths(t *testing.T) {
	// 2026-10-31 23:30 JST（UTC だとまだ 10/31 14:30。JST の日付で判定すること）
	now := time.Date(2026, 10, 31, 23, 30, 0, 0, jst.Location)
	stored := []*entity.WorkLocation{
		{Date: "2026-10-30", Location: "滋賀県草津市"}, // 過去
		{Date: "2026-10-31", Location: "リモート"},
		{Date: "2026-11-02", Location: Unavailable},
	}
	var deleted []string
	var upserted []*entity.WorkLocation
	repo := &mock.MockWorkLocationRepository{
		SelectAllFunc:  func(context.Context) ([]*entity.WorkLocation, error) { return stored, nil },
		BulkDeleteFunc: func(_ context.Context, ds []string) error { deleted = ds; return nil },
		BulkUpsertFunc: func(_ context.Context, ws []*entity.WorkLocation) error { upserted = ws; return nil },
	}
	got, err := NewWorkLocationService(repo, func() time.Time { return now }).ListPublished(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(deleted) != 1 || deleted[0] != "2026-10-30" {
		t.Fatalf("past entries must be deleted, got %v", deleted)
	}
	if got["2026-10-31"] != "リモート" || got["2026-11-02"] != Unavailable {
		t.Fatalf("registered entries must be kept: %v", got)
	}
	// 10/31 + 2 か月 = 12/31（JS の setMonth と同じ）。11/01 は未登録なので Undecided
	if got["2026-11-01"] != Undecided || got["2026-12-31"] != Undecided {
		t.Fatalf("fill missing: %v", got)
	}
	if _, ok := got["2027-01-01"]; ok {
		t.Fatalf("must not fill beyond two months")
	}
	if len(got) != 62 || len(upserted) != 60 { // 10/31〜12/31 = 62 日、うち登録済み 2 日
		t.Fatalf("want 62 days and 60 fills, got %d / %d", len(got), len(upserted))
	}
}

func TestListPublished_MonthEndOverflowLikeJS(t *testing.T) {
	// 12/31 + 2 か月 → 2 月 31 日 → 3/3（JS の Date#setMonth と同じ繰り越し）
	now := time.Date(2026, 12, 31, 9, 0, 0, 0, jst.Location)
	repo := &mock.MockWorkLocationRepository{
		SelectAllFunc:  func(context.Context) ([]*entity.WorkLocation, error) { return nil, nil },
		BulkUpsertFunc: func(context.Context, []*entity.WorkLocation) error { return nil },
	}
	got, err := NewWorkLocationService(repo, func() time.Time { return now }).ListPublished(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := got["2027-03-03"]; !ok {
		t.Fatalf("want last day 2027-03-03")
	}
	if _, ok := got["2027-03-04"]; ok {
		t.Fatalf("must stop at 2027-03-03")
	}
}

func TestSet_DeduplicatesAndUpserts(t *testing.T) {
	var upserted []*entity.WorkLocation
	repo := &mock.MockWorkLocationRepository{
		BulkUpsertFunc: func(_ context.Context, ws []*entity.WorkLocation) error { upserted = ws; return nil },
	}
	n, err := NewWorkLocationService(repo, nil).Set(context.Background(), []string{"2026-11-02", "2026-11-01", "2026-11-02"}, "リモート")
	if err != nil {
		t.Fatal(err)
	}
	if n != 3 || len(upserted) != 2 || upserted[0].Date != "2026-11-01" {
		t.Fatalf("got n=%d upserted=%v", n, upserted)
	}
}
