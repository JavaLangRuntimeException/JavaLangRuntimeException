import { Fragment, useMemo } from "react";
import { getLocationStyle } from "@/entities/work-location";
import { CELL_LABEL, cellState, formatDateKey, isDateLimited, isDateUnavailable, oneMonthAfter, type BusinessHours, type CellState } from "@/entities/slot";
import { getMonday, pad, weekdayName, type BusyInterval } from "@/shared/lib/busy";
import { cx } from "@/utils/cx";

// 9:00〜22:30 の 30 分ごとの行（旧実装と同じく営業時間に関係なく 28 行）
const ROWS = Array.from({ length: 28 }, (_, i) => ({ hour: 9 + Math.floor(i / 2), min: i % 2 === 0 ? 0 : 30 }));

const CELL_STYLE: Record<CellState, string> = {
  past: "cursor-not-allowed bg-background-secondary-default text-text-disabled",
  unavailable: "cursor-not-allowed bg-background-secondary-default text-text-disabled",
  blocked: "cursor-not-allowed bg-background-secondary-default text-text-disabled",
  selected: "bg-accent-500/15 text-accent-300 hover:bg-accent-500/25",
  available: "bg-background-primary-default text-text-secondary hover:bg-background-primary-hover hover:text-text-primary",
};

/**
 * 1 週間の 30 分枠カレンダー。埋まっている時間・2 時間以内・1 か月先・年末年始・対応不可日は選べない。
 * 日付の見出しは、予約できる枠がない日を赤、残りわずか（3 枠以下）を黄色にする
 */
export function WeekGrid({
  busy,
  focusDate,
  selectedStart,
  selectedEnd,
  onSelectSlot,
  businessHours,
  locations,
}: {
  busy: BusyInterval[];
  focusDate: Date;
  selectedStart: Date;
  selectedEnd: Date;
  onSelectSlot: (slotStart: Date, slotEnd: Date) => void;
  businessHours: BusinessHours;
  locations: Record<string, string>;
}) {
  const now = useMemo(() => new Date(), []);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const ctx = { now, oneMonthLater: oneMonthAfter(now), hours: businessHours, locations, busy };
  const monday = getMonday(focusDate);
  const days = Array.from({ length: 7 }, (_, i) => new Date(monday.getTime() + i * 86400000));

  return (
    <div className="overflow-x-auto rounded-xl border border-border-table">
      <div className="grid min-w-[700px] grid-cols-[72px_repeat(7,1fr)]">
        <div className="bg-background-secondary-default" />
        {days.map((d) => {
          const isToday = d.getTime() === today.getTime();
          const unavailable = isDateUnavailable(d, ctx);
          const limited = isDateLimited(d, ctx);
          const locName = locations[formatDateKey(d)];
          const locStyle = locName ? getLocationStyle(locName) : null;
          return (
            <div
              key={d.toDateString()}
              className={cx(
                "flex flex-col items-center gap-0.5 border-b border-border-table px-1 py-2 text-center text-body-2-semibold",
                isToday
                  ? "bg-accent-500/15 text-accent-300 shadow-[inset_0_-2px_0] shadow-accent-500"
                  : unavailable
                    ? "bg-background-tertiary-error text-text-error-primary"
                    : limited
                      ? "bg-status-yellow-background text-text-primary"
                      : "bg-background-secondary-default text-text-secondary",
              )}
            >
              <span>{`${d.getMonth() + 1}/${d.getDate()}(${weekdayName(d)})`}</span>
              {/* 勤務場所の色分けはデータの区別色 */}
              {locStyle && <span className={cx("text-caption-2-bold leading-tight", locStyle.text)}>{locStyle.label}</span>}
            </div>
          );
        })}
        {ROWS.map(({ hour, min }) => (
          <Fragment key={`${hour}:${min}`}>
            <div className="border-t border-border-table px-2 py-1.5 text-end text-caption-1-regular tabular-nums text-text-tertiary">
              {`${pad(hour)}:${min === 0 ? "00" : "30"}`}
            </div>
            {days.map((d) => {
              const cellStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, min, 0);
              const cellEnd = new Date(cellStart.getTime() + 30 * 60 * 1000);
              const state = cellState(cellStart, { ...ctx, selectedStart, selectedEnd });
              const disabled = state === "past" || state === "unavailable" || state === "blocked";
              return (
                <button
                  type="button"
                  key={`${d.toDateString()}-${hour}-${min}`}
                  aria-label={`${d.getMonth() + 1}/${d.getDate()}(${weekdayName(d)}) ${pad(hour)}:${pad(min)} ${CELL_LABEL[state]}`}
                  aria-pressed={state === "selected"}
                  className={cx(
                    "border-s border-t border-border-table px-1 py-1.5 text-center text-caption-1-medium transition-colors",
                    "outline-none focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                    CELL_STYLE[state],
                  )}
                  disabled={disabled}
                  onClick={() => !disabled && onSelectSlot(cellStart, cellEnd)}
                >
                  {CELL_LABEL[state]}
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
