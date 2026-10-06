import { RiArrowLeftSLine, RiArrowRightSLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";

/** 「前へ  1 / 3  次へ」のページ送り */
export function PrevNextPagination({
  currentPage,
  totalPages,
  onPrev,
  onNext,
  isNextDisabled = false,
}: {
  currentPage: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  isNextDisabled?: boolean;
}) {
  return (
    <nav aria-label="ページ送り" className="flex items-center justify-center gap-3">
      <Button variant="secondary" size="small" leadingIcon={RiArrowLeftSLine} onClick={onPrev} disabled={currentPage === 1}>
        前へ
      </Button>
      <span className="min-w-16 text-center text-body-2-medium tabular-nums text-text-secondary" aria-live="polite">
        {currentPage} / {totalPages}
      </span>
      <Button variant="secondary" size="small" trailingIcon={RiArrowRightSLine} onClick={onNext} disabled={isNextDisabled}>
        次へ
      </Button>
    </nav>
  );
}
