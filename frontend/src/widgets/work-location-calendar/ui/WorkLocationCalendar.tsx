import { useMemo, useState } from "react";
import { RiArrowLeftSLine, RiArrowRightSLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { getLocationStyle, LOCATION_STYLES } from "@/entities/work-location";
import { Card } from "@/shared/ui/layout";
import { cx } from "@/utils/cx";
import { buildMonth, DAY_NAMES_MON_FIRST, formatDateLabel, formatYMD } from "../model/calendar";

type LocationMap = Record<string, string>;

/** 月のカレンダー（場所を漢字 1 文字で表示）+ 選んだ日の場所 + 凡例 + 一覧 */
export function WorkLocationCalendar({ locations }: { locations: LocationMap }) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [monthOffset, setMonthOffset] = useState(0);
  const todayStr = formatYMD(new Date());
  const month = useMemo(() => buildMonth(new Date(), monthOffset), [monthOffset]);

  const displayDate = selectedDate || todayStr;
  const displayLocation = locations[displayDate];
  const sortedDates = Object.keys(locations).sort();

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4 sm:p-6">
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="ghost"
            size="small"
            iconOnly
            leadingIcon={RiArrowLeftSLine}
            aria-label="前の月"
            disabled={monthOffset <= 0}
            onClick={() => setMonthOffset((p) => p - 1)}
          />
          <h2 className="min-w-32 text-center text-headline-semibold text-text-primary" aria-live="polite">
            {month.year}年{month.month}月
          </h2>
          <Button variant="ghost" size="small" iconOnly leadingIcon={RiArrowRightSLine} aria-label="次の月" onClick={() => setMonthOffset((p) => p + 1)} />
          {monthOffset !== 0 && (
            <Button variant="secondary" size="xs" onClick={() => setMonthOffset(0)}>
              今月
            </Button>
          )}
        </div>

        <div role="grid" aria-label={`${month.year}年${month.month}月`} className="flex flex-col gap-1">
          <div role="row" className="grid grid-cols-7 gap-1">
            {DAY_NAMES_MON_FIRST.map((name) => (
              <div
                key={name}
                role="columnheader"
                className={cx(
                  "py-1 text-center text-caption-1-medium",
                  name === "日" ? "text-text-error-primary" : name === "土" ? "text-accent-300" : "text-text-tertiary",
                )}
              >
                {name}
              </div>
            ))}
          </div>
          {month.weeks.map((week, wi) => (
            <div key={wi} role="row" className="grid grid-cols-7 gap-1">
              {week.map((date) => {
                const dateStr = formatYMD(date);
                const locationName = locations[dateStr];
                const isCurrentMonth = date.getMonth() + 1 === month.month;
                const isPast = dateStr < todayStr;
                const isToday = dateStr === todayStr;
                const selected = dateStr === displayDate;
                const style = locationName ? getLocationStyle(locationName) : null;
                return (
                  <div key={dateStr} role="gridcell" aria-selected={selected}>
                    <button
                      type="button"
                      onClick={() => !isPast && setSelectedDate(dateStr)}
                      disabled={isPast}
                      aria-label={`${formatDateLabel(dateStr)}${locationName ? ` ${locationName}` : ""}`}
                      className={cx(
                        "flex h-12 w-full flex-col items-center justify-center rounded-xl text-body-2-regular outline-none transition-colors",
                        "focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                        !isCurrentMonth && "opacity-50",
                        isPast ? "cursor-not-allowed text-text-tertiary" : "cursor-pointer hover:bg-background-secondary-hover",
                        isPast && isCurrentMonth && "opacity-60",
                        isToday && "ring-2 ring-accent-500",
                        selected && "bg-accent-500/15",
                        locationName ? "text-body-2-semibold text-text-primary" : "text-text-tertiary",
                      )}
                    >
                      <span>{date.getDate()}</span>
                      {style && isCurrentMonth && <span className={cx("text-caption-2-semibold leading-tight", style.text)}>{style.char}</span>}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* 選んだ日の場所 */}
        <div className="flex min-h-16 items-center justify-center rounded-xl bg-background-secondary-default px-4 py-3" aria-live="polite">
          {displayLocation ? (
            <div className="flex flex-col items-center gap-1">
              <span className="text-caption-1-regular text-text-tertiary">{formatDateLabel(displayDate)}</span>
              <p className={cx("flex items-center gap-2 text-headline-semibold", getLocationStyle(displayLocation).text)}>
                <span className={cx("inline-block size-2.5 rounded-full", getLocationStyle(displayLocation).dot)} aria-hidden />
                {displayLocation}
              </p>
            </div>
          ) : (
            <p className="text-body-2-regular text-text-tertiary">{displayDate === todayStr ? "今日の勤務場所は未登録です" : "日付をクリックして確認"}</p>
          )}
        </div>

        {/* 凡例 */}
        <div className="flex flex-col gap-3 border-t border-separator-border pt-4">
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-caption-1-regular text-text-secondary">
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-3 rounded ring-2 ring-accent-500" aria-hidden />
              今日
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-3 rounded bg-accent-500/15" aria-hidden />
              選択中
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-3 rounded bg-background-tertiary-default opacity-40" aria-hidden />
              過去（選択不可）
            </span>
          </div>
          <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-caption-1-regular text-text-secondary">
            {Object.entries(LOCATION_STYLES).map(([name, s]) => (
              <li key={name} className="flex items-center gap-1">
                <span className={cx("inline-block w-3.5 text-center text-caption-1-bold", s.text)} aria-hidden>
                  {s.char}
                </span>
                {name}
              </li>
            ))}
          </ul>
        </div>
      </Card>

      {/* 一覧 */}
      <Card className="overflow-hidden p-0">
        {sortedDates.length === 0 ? (
          <p className="py-8 text-center text-body-regular text-text-tertiary">勤務場所の登録がありません</p>
        ) : (
          <ul className="divide-y divide-separator-border">
            {sortedDates.map((date) => {
              const style = getLocationStyle(locations[date]);
              const isToday = date === todayStr;
              return (
                <li key={date}>
                  <button
                    type="button"
                    onClick={() => setSelectedDate(date)}
                    aria-current={date === displayDate ? "date" : undefined}
                    className={cx(
                      "flex w-full items-center justify-between gap-3 px-5 py-3.5 text-start outline-none transition-colors",
                      "hover:bg-background-secondary-hover focus-visible:bg-background-secondary-hover",
                      date === displayDate && "bg-background-secondary-default",
                    )}
                  >
                    <span className="flex items-center gap-3">
                      {isToday && <span className="rounded-full bg-accent-600 px-2 py-0.5 text-caption-2-bold text-text-white">TODAY</span>}
                      <span className="text-body-medium text-text-primary">{formatDateLabel(date)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className={cx("inline-block size-2 rounded-full", style.dot)} aria-hidden />
                      <span className={cx("text-body-2-medium", style.text)}>{locations[date]}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
