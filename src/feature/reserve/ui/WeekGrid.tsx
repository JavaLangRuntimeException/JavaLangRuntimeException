"use client";

import React from "react";

function weekdayName(d: Date) {
  return ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
}
function pad(n: number) {
  return n.toString().padStart(2, "0");
}
function getMonday(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}
function isOverlappingBusy(start: Date, end: Date, busy: { start: string; end: string }[]): boolean {
  const s = start.getTime();
  const e = end.getTime();
  return busy.some((b) => {
    const bs = new Date(b.start).getTime();
    const be = new Date(b.end).getTime();
    return Math.max(s, bs) < Math.min(e, be);
  });
}

export function WeekGrid({
  busy,
  focusDate,
  selectedStart,
  selectedEnd,
  onSelectSlot,
}: {
  busy: { start: string; end: string }[];
  focusDate: Date;
  selectedStart: Date;
  selectedEnd: Date;
  onSelectSlot: (slotStart: Date, slotEnd: Date) => void;
}) {
  const monday = getMonday(focusDate);
  const days = Array.from({ length: 7 }, (_, i) => new Date(monday.getTime() + i * 86400000));
  const rows = Array.from({ length: 30 }, (_, i) => ({ hour: 9 + Math.floor(i / 2), min: i % 2 === 0 ? 0 : 30 }));
  const now = new Date();
  const leadMs = 2 * 60 * 60 * 1000;
  const leadCutoff = new Date(now.getTime() + leadMs);
  const oneMonthLater = new Date(now);
  oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[700px] rounded-lg border border-zinc-200">
        <div className="grid grid-cols-[100px_repeat(7,1fr)] text-zinc-900">
          <div />
          {days.map((d) => (
            <div key={d.toDateString()} className="p-2 text-center text-sm text-zinc-600">
              {`${d.getMonth() + 1}/${d.getDate()}(${weekdayName(d)})`}
            </div>
          ))}
          {rows.map(({ hour, min }) => (
            <React.Fragment key={`${hour}:${min}`}>
              <div className="border-t border-zinc-200 p-1 text-right text-xs text-zinc-500">
                {min === 0 ? `${pad(hour)}:00` : `${pad(hour)}:30`}
              </div>
              {days.map((d) => {
                const cellStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, min, 0);
                const cellEnd = new Date(cellStart.getTime() + 30 * 60 * 1000);
                const isPast = cellEnd.getTime() <= now.getTime();
                const withinLead = cellStart.getTime() < leadCutoff.getTime();
                const beyondOneMonth = cellStart.getTime() > oneMonthLater.getTime();
                const blocked = isOverlappingBusy(cellStart, cellEnd, busy);
                const withinSelection = cellEnd > selectedStart && cellStart < selectedEnd;
                return (
                  <button
                    type="button"
                    key={`${d.toDateString()}-${hour}-${min}`}
                    className={`border-t border-l border-zinc-200 p-2 text-center text-xs transition-colors ${
                      blocked || isPast || withinLead || beyondOneMonth
                        ? "cursor-not-allowed bg-zinc-100 text-zinc-400"
                        : withinSelection
                        ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
                        : "bg-white hover:bg-zinc-50"
                    }`}
                    disabled={blocked || isPast || withinLead || beyondOneMonth}
                    onClick={() => {
                      if (isPast || withinLead || beyondOneMonth) return;
                      onSelectSlot(cellStart, cellEnd);
                    }}
                  >
                    {isPast ? "過去" : withinLead || beyondOneMonth ? "不可" : blocked ? "不可" : withinSelection ? "選択中" : "可"}
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}


