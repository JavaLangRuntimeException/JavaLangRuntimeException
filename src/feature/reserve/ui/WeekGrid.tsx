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
  businessHours = { start: 9, end: 24 },
}: {
  busy: { start: string; end: string }[];
  focusDate: Date;
  selectedStart: Date;
  selectedEnd: Date;
  onSelectSlot: (slotStart: Date, slotEnd: Date) => void;
  businessHours?: { start: number; end: number };
}) {
  const monday = getMonday(focusDate);
  const days = Array.from({ length: 7 }, (_, i) => new Date(monday.getTime() + i * 86400000));
  const rows = Array.from({ length: 30 }, (_, i) => ({ hour: 9 + Math.floor(i / 2), min: i % 2 === 0 ? 0 : 30 }));
  const now = new Date();
  const today = React.useMemo(() => new Date(now.getFullYear(), now.getMonth(), now.getDate()), []);
  const leadMs = 2 * 60 * 60 * 1000;
  const leadCutoff = React.useMemo(() => new Date(now.getTime() + leadMs), [now, leadMs]);
  const oneMonthLater = React.useMemo(() => {
    const date = new Date(now);
    date.setMonth(date.getMonth() + 1);
    return date;
  }, [now]);

  // 予約不可日付の判定関数
  const isDateUnavailable = React.useCallback((date: Date) => {
    const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
    const dateEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);

    // 過去の日付は予約不可
    if (dateStart.getTime() < today.getTime()) {
      return true;
    }

    // 1ヶ月以降は予約不可
    if (dateStart.getTime() > oneMonthLater.getTime()) {
      return true;
    }


    // 営業時間内の全時間帯が予約済みかチェック
    const businessStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), businessHours.start, 0, 0);
    const businessEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), businessHours.end, 0, 0);

    // 30分刻みで営業時間内の全時間帯をチェック
    const slots = [];
    for (let hour = businessHours.start; hour < businessHours.end; hour++) {
      for (let min = 0; min < 60; min += 30) {
        const slotStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, min, 0);
        const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);

        // 2時間以内の制約をチェック
        const isWithinLead = slotStart.getTime() < leadCutoff.getTime();
        if (isWithinLead) continue;

        // 営業時間外はスキップ
        if (slotStart.getTime() < businessStart.getTime() || slotEnd.getTime() > businessEnd.getTime()) {
          continue;
        }

        slots.push({ start: slotStart, end: slotEnd });
      }
    }

    // 全時間帯が予約済みまたは制約に引っかかる場合は予約不可
    const availableSlots = slots.filter(slot => {
      const isBlocked = isOverlappingBusy(slot.start, slot.end, busy);
      return !isBlocked;
    });

    return availableSlots.length === 0;
  }, [busy, today, oneMonthLater, leadCutoff, businessHours]);

  // 予約可能時間が残りわずかの判定関数
  const isDateLimited = React.useCallback((date: Date) => {
    const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);

    // 過去の日付や1ヶ月以降は対象外
    if (dateStart.getTime() < today.getTime() || dateStart.getTime() > oneMonthLater.getTime()) {
      return false;
    }

    // 営業時間内の全時間帯をチェック
    const businessStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), businessHours.start, 0, 0);
    const businessEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), businessHours.end, 0, 0);

    // 30分刻みで営業時間内の全時間帯をチェック
    const slots = [];
    for (let hour = businessHours.start; hour < businessHours.end; hour++) {
      for (let min = 0; min < 60; min += 30) {
        const slotStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, min, 0);
        const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);

        // 2時間以内の制約をチェック
        const isWithinLead = slotStart.getTime() < leadCutoff.getTime();
        if (isWithinLead) continue;

        // 営業時間外はスキップ
        if (slotStart.getTime() < businessStart.getTime() || slotEnd.getTime() > businessEnd.getTime()) {
          continue;
        }

        slots.push({ start: slotStart, end: slotEnd });
      }
    }

    // 利用可能な時間帯をフィルタリング
    const availableSlots = slots.filter(slot => {
      const isBlocked = isOverlappingBusy(slot.start, slot.end, busy);
      return !isBlocked;
    });

    // 残り時間が少ない場合の判定（全体の25%以下）
    const totalSlots = slots.length;
    const availableCount = availableSlots.length;

    // 利用可能な時間帯が25%以下の場合、または利用可能な時間帯が3時間以下（3スロット）の場合
    return availableCount <= 3;
  }, [busy, today, oneMonthLater, leadCutoff, businessHours]);
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[700px] overflow-hidden rounded-2xl border border-white/20 bg-white/90 shadow-lg backdrop-blur">
        <div className="grid grid-cols-[100px_repeat(7,1fr)] text-zinc-900">
          <div className="bg-gradient-to-b from-zinc-50 to-white" />
          {days.map((d) => {
            const isToday = d.getTime() === today.getTime();
            const isUnavailable = isDateUnavailable(d);
            const isLimited = isDateLimited(d);
            return (
              <div
                key={d.toDateString()}
                className={`p-2 text-center text-sm font-semibold ${
                  isToday
                    ? "bg-gradient-to-b from-blue-100 to-blue-50 text-blue-700 border-b-2 border-blue-400"
                    : isUnavailable
                    ? "bg-gradient-to-b from-red-100/60 to-red-50/60 text-red-500/80"
                    : isLimited
                    ? "bg-gradient-to-b from-yellow-100/80 to-yellow-50/80 text-yellow-700/90"
                    : "bg-gradient-to-b from-zinc-50 to-white text-zinc-600"
                }`}
              >
                {`${d.getMonth() + 1}/${d.getDate()}(${weekdayName(d)})`}
              </div>
            );
          })}
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
                // Business hours constraint
                const startMinutes = cellStart.getHours() * 60 + cellStart.getMinutes();
                let endMinutes = cellEnd.getHours() * 60 + cellEnd.getMinutes();
                if (cellEnd.getDate() !== cellStart.getDate() && cellEnd.getHours() === 0) endMinutes = 24 * 60; // treat midnight as 24:00
                const allowStartMinutes = businessHours.start * 60;
                const allowEndMinutes = businessHours.end * 60;
                const outsideBusiness = startMinutes < allowStartMinutes || endMinutes > allowEndMinutes;
                return (
                  <button
                    type="button"
                    key={`${d.toDateString()}-${hour}-${min}`}
                    className={`border-t border-l border-zinc-200 p-2 text-center text-xs transition-colors focus:z-10 focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
                      blocked || isPast || withinLead || beyondOneMonth || outsideBusiness
                        ? "cursor-not-allowed bg-zinc-100 text-zinc-400"
                        : withinSelection
                        ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
                        : "bg-white hover:bg-zinc-50"
                    }`}
                    disabled={blocked || isPast || withinLead || beyondOneMonth || outsideBusiness}
                    onClick={() => {
                      if (isPast || withinLead || beyondOneMonth || outsideBusiness) return;
                      onSelectSlot(cellStart, cellEnd);
                    }}
                  >
                    {isPast ? "過去" : withinLead || beyondOneMonth || outsideBusiness ? "不可" : blocked ? "不可" : withinSelection ? "選択中" : "可"}
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


