import { Button } from "@/components/base/buttons/button";
import { useT } from "@/shared/lib/i18n";
import { cx } from "@/utils/cx";
import { CHEAT_SHEET_SERIES } from "../model/series";

/** シリーズで絞り込むボタン群と Clear */
export function SeriesButtons({
  seriesList,
  selectedSeries,
  onSelect,
  onClear,
}: {
  seriesList: readonly string[];
  selectedSeries: string;
  onSelect: (series: string) => void;
  onClear: () => void;
}) {
  const t = useT();
  return (
    <div role="group" aria-label={t({ ja: "シリーズ", en: "Series" })} className="flex flex-wrap items-center gap-2">
      {seriesList.map((series) => {
        const selected = series === selectedSeries;
        return (
          <button
            key={series}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(series)}
            className={cx(
              "press rounded-full border px-3.5 py-1.5 text-body-2-medium outline-none",
              "focus-visible:ring-2 focus-visible:ring-border-focus-ring",
              selected
                ? "border-accent-600 bg-accent-500/15 text-accent-300"
                : "border-border-button-default bg-background-primary-default text-text-secondary hover:border-border-button-hover hover:text-text-primary",
            )}
          >
            {/* シリーズ名は Qiita の記事のタイトルの一部なので訳さない（チートシートだけはこのサイトの分類） */}
            {series === CHEAT_SHEET_SERIES ? t({ ja: series, en: "Cheat Sheets" }) : series}
          </button>
        );
      })}
      {selectedSeries && (
        <Button variant="ghost" size="small" onClick={onClear}>
          Clear
        </Button>
      )}
    </div>
  );
}
