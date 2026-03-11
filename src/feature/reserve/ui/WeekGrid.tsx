"use client";

import React, { useState, useEffect } from "react";

// 勤務場所の色・文字マッピング（location/page.tsxと同期）
const LOCATION_STYLES: Record<string, { color: string; char: string }> = {
  "滋賀県草津市":           { color: "text-emerald-600", char: "草" },
  "滋賀県（草津市以外）":     { color: "text-emerald-700", char: "滋" },
  "京都府京都市":           { color: "text-purple-600",  char: "京" },
  "京都府（京都市以外）":     { color: "text-purple-700",  char: "都" },
  "大阪府大阪市":           { color: "text-orange-600",  char: "阪" },
  "大阪府茨木市":           { color: "text-amber-600",   char: "茨" },
  "大阪府（大阪市・茨木市以外）": { color: "text-orange-700", char: "大" },
  "東京都渋谷区":           { color: "text-red-600",     char: "渋" },
  "東京都（渋谷区以外）":     { color: "text-red-700",     char: "東" },
  "愛知県名古屋市":         { color: "text-blue-600",    char: "名" },
  "愛知県（名古屋市以外）":   { color: "text-blue-700",    char: "愛" },
  "岐阜県":               { color: "text-lime-600",    char: "岐" },
  "リモート":              { color: "text-cyan-600",    char: "リ" },
  "複数箇所（お問い合わせください）": { color: "text-pink-600", char: "複" },
  "未定（お問い合わせください）": { color: "text-gray-500",   char: "？" },
  "対応不可日・休日":        { color: "text-rose-600",    char: "休" },
};

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
  businessHours = { start: 9, end: 23 },
}: {
  busy: { start: string; end: string }[];
  focusDate: Date;
  selectedStart: Date;
  selectedEnd: Date;
  onSelectSlot: (slotStart: Date, slotEnd: Date) => void;
  businessHours?: { start: number; end: number };
}) {
  const [locations, setLocations] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/location")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) setLocations(data.locations || {});
      })
      .catch(() => {});
  }, []);

  const monday = getMonday(focusDate);
  const days = Array.from({ length: 7 }, (_, i) => new Date(monday.getTime() + i * 86400000));
  const rows = Array.from({ length: 28 }, (_, i) => ({ hour: 9 + Math.floor(i / 2), min: i % 2 === 0 ? 0 : 30 }));
  const now = React.useMemo(() => new Date(), []);
  const today = React.useMemo(() => new Date(now.getFullYear(), now.getMonth(), now.getDate()), [now]);
  const leadMs = 2 * 60 * 60 * 1000;
  const leadCutoff = React.useMemo(() => new Date(now.getTime() + leadMs), [now, leadMs]);
  const oneMonthLater = React.useMemo(() => {
    const date = new Date(now);
    date.setMonth(date.getMonth() + 1);
    return date;
  }, [now]);

  // 12/29-1/5の期間チェック関数
  const isHolidayPeriod = React.useCallback((date: Date) => {
    const month = date.getMonth() + 1;
    const day = date.getDate();

    // 12/29-12/31
    if (month === 12 && day >= 29) {
      return true;
    }
    // 1/1-1/5
    if (month === 1 && day <= 5) {
      return true;
    }
    return false;
  }, []);

  // 予約不可日付の判定関数
  const isDateUnavailable = React.useCallback((date: Date) => {
    const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);

    // 過去の日付は予約不可
    if (dateStart.getTime() < today.getTime()) {
      return true;
    }

    // 1ヶ月以降は予約不可
    if (dateStart.getTime() > oneMonthLater.getTime()) {
      return true;
    }

    // 12/29-1/5は予約不可
    if (isHolidayPeriod(date)) {
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
  }, [busy, today, oneMonthLater, leadCutoff, businessHours, isHolidayPeriod]);

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

    // 利用可能な時間帯が3時間以下（3スロット）の場合
    const availableCount = availableSlots.length;
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
            const dateKey = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
            const locName = locations[dateKey];
            const locStyle = locName ? LOCATION_STYLES[locName] : null;
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
                <div>{`${d.getMonth() + 1}/${d.getDate()}(${weekdayName(d)})`}</div>
                {locStyle && (
                  <div className={`text-xs font-bold ${locStyle.color}`}>
                    {locStyle.char}
                  </div>
                )}
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
                const isHoliday = isHolidayPeriod(d);
                const blocked = isOverlappingBusy(cellStart, cellEnd, busy);
                const withinSelection = cellEnd > selectedStart && cellStart < selectedEnd;
                // Business hours constraint
                const startMinutes = cellStart.getHours() * 60 + cellStart.getMinutes();
                const endMinutes = cellEnd.getHours() * 60 + cellEnd.getMinutes();
                const allowStartMinutes = businessHours.start * 60;
                const allowEndMinutes = businessHours.end * 60;
                const outsideBusiness = startMinutes < allowStartMinutes || endMinutes > allowEndMinutes;
                const isDisabled = blocked || isPast || withinLead || beyondOneMonth || outsideBusiness || isHoliday;
                return (
                  <button
                    type="button"
                    key={`${d.toDateString()}-${hour}-${min}`}
                    className={`border-t border-l border-zinc-200 p-2 text-center text-xs transition-colors focus:z-10 focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
                      isDisabled
                        ? "cursor-not-allowed bg-zinc-100 text-zinc-400"
                        : withinSelection
                        ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
                        : "bg-white hover:bg-zinc-50"
                    }`}
                    disabled={isDisabled}
                    onClick={() => {
                      if (isPast || withinLead || beyondOneMonth || outsideBusiness || isHoliday) return;
                      onSelectSlot(cellStart, cellEnd);
                    }}
                  >
                    {isPast ? "過去" : withinLead || beyondOneMonth || outsideBusiness || isHoliday ? "不可" : blocked ? "不可" : withinSelection ? "選択中" : "可"}
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


