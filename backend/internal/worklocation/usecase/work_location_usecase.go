package usecase

import (
	"context"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/worklocation/domain/service"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/errs"
)

// WorkLocationUsecaseImpl は生成された WorkLocationUsecase interface の実装。
// 管理者だけが呼べる RPC の認可は cmd/worklocation の interceptor が行う。
type WorkLocationUsecaseImpl struct {
	service *service.WorkLocationService
}

var _ WorkLocationUsecase = (*WorkLocationUsecaseImpl)(nil)

func NewWorkLocationUsecase(s *service.WorkLocationService) *WorkLocationUsecaseImpl {
	return &WorkLocationUsecaseImpl{service: s}
}

func (u *WorkLocationUsecaseImpl) ListWorkLocations(ctx context.Context, _ ListWorkLocationsInput) (*ListWorkLocationsOutput, error) {
	locations, err := u.service.ListPublished(ctx)
	if err != nil {
		return nil, errs.NewInternalError(err).WithCode("fetch_failed")
	}
	return &ListWorkLocationsOutput{Locations: locations}, nil
}

func validDate(d string) bool {
	_, err := time.Parse(time.DateOnly, d)
	return err == nil
}

func (u *WorkLocationUsecaseImpl) SetWorkLocations(ctx context.Context, input SetWorkLocationsInput) (*SetWorkLocationsOutput, error) {
	if len(input.Dates) == 0 || input.Location == "" {
		return nil, errs.NewCodedError(errs.ErrorTypeBadRequest, "missing_fields", "日付と勤務場所を指定してください")
	}
	for _, d := range input.Dates {
		if !validDate(d) {
			return nil, errs.NewValidationError("dates", "日付は YYYY-MM-DD で指定してください").WithCode("invalid_date")
		}
	}
	n, err := u.service.Set(ctx, input.Dates, input.Location)
	if err != nil {
		return nil, errs.NewInternalError(err).WithCode("save_failed")
	}
	return &SetWorkLocationsOutput{Count: int32(n)}, nil
}

func (u *WorkLocationUsecaseImpl) DeleteWorkLocation(ctx context.Context, input DeleteWorkLocationInput) error {
	if input.Date == "" {
		return errs.NewCodedError(errs.ErrorTypeBadRequest, "missing_fields", "日付を指定してください")
	}
	if err := u.service.Delete(ctx, input.Date); err != nil {
		return errs.NewInternalError(err).WithCode("delete_failed")
	}
	return nil
}

func (u *WorkLocationUsecaseImpl) GetWorkLocation(ctx context.Context, input GetWorkLocationInput) (*GetWorkLocationOutput, error) {
	loc, err := u.service.Get(ctx, input.Date)
	if err != nil {
		return nil, errs.NewInternalError(err)
	}
	return &GetWorkLocationOutput{Location: loc}, nil
}
