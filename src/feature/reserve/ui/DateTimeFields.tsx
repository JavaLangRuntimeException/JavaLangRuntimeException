"use client";

import React from "react";
import { CalendarClock, Clock, Info } from "lucide-react";

function UnderLabelSelect({ value, setValue, options, underLabel, disabled }: { value: number | null; setValue: (n: number) => void; options: number[]; underLabel: string; disabled?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <select
        className="w-full rounded-md border border-zinc-300 bg-white p-2 text-center text-zinc-900 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-60 disabled:cursor-not-allowed"
        value={value ?? ""}
        onChange={(e) => setValue(Number(e.target.value))}
        disabled={!!disabled}
      >
        <option value="" disabled hidden>
          --
        </option>
        {options.map((o) => (
          <option key={o} value={o}>
            {String(o).padStart(2, "0")}
          </option>
        ))}
      </select>
      <div className="mt-0.5 text-xs text-zinc-500">{underLabel}</div>
    </div>
  );
}

export function DateTimeFields({
  year,
  month,
  day,
  setYear,
  setMonth,
  setDay,
  weekday,
  startHour,
  startMin,
  endHour,
  endMin,
  setStartHour,
  setStartMin,
  setEndHour,
  setEndMin,
  hours,
  minuteOptions,
  yearOptions,
  monthOptions,
  selectionInvalid,
  timeError,
  disabled,
  offlineHoursInvalid,
}: {
  year: number | null;
  month: number | null;
  day: number | null;
  setYear: (n: number) => void;
  setMonth: (n: number) => void;
  setDay: (n: number) => void;
  weekday: string;
  startHour: number | null;
  startMin: number | null;
  endHour: number | null;
  endMin: number | null;
  setStartHour: (n: number) => void;
  setStartMin: (n: number) => void;
  setEndHour: (n: number) => void;
  setEndMin: (n: number) => void;
  hours: number[];
  minuteOptions: number[];
  yearOptions: number[];
  monthOptions: number[];
  selectionInvalid: boolean;
  timeError?: string;
  disabled?: boolean;
  offlineHoursInvalid?: boolean;
}) {
  const startMinuteOptions = React.useMemo(() => (startHour === 24 ? [0] : minuteOptions), [startHour, minuteOptions]);
  const endMinuteOptions = React.useMemo(() => (endHour === 24 ? [0] : minuteOptions), [endHour, minuteOptions]);

  const handleSetStartHour = React.useCallback((h: number) => {
    setStartHour(h);
    if (h === 24 && startMin === 30) setStartMin(0);
  }, [setStartHour, startMin, setStartMin]);

  const handleSetEndHour = React.useCallback((h: number) => {
    setEndHour(h);
    if (h === 24 && endMin === 30) setEndMin(0);
  }, [setEndHour, endMin, setEndMin]);

  React.useEffect(() => {
    if (startHour === 24 && startMin === 30) setStartMin(0);
  }, [startHour, startMin, setStartMin]);

  React.useEffect(() => {
    if (endHour === 24 && endMin === 30) setEndMin(0);
  }, [endHour, endMin, setEndMin]);

  const endBeforeOrEqualStart = React.useMemo(() => {
    if (startHour == null || startMin == null || endHour == null || endMin == null) return false;
    if (endHour < startHour) return true;
    if (endHour === startHour && endMin <= startMin) return true;
    return false;
  }, [startHour, startMin, endHour, endMin]);
  const isPastDate = React.useMemo(() => {
    if (year == null || month == null || day == null) return false;
    const sel = new Date(year, month - 1, day);
    const today = new Date();
    sel.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    return sel.getTime() < today.getTime();
  }, [year, month, day]);

  const isBeyondOneMonth = React.useMemo(() => {
    if (year == null || month == null || day == null) return false;
    const sel = new Date(year, month - 1, day);
    const lim = new Date();
    lim.setMonth(lim.getMonth() + 1);
    sel.setHours(0, 0, 0, 0);
    lim.setHours(0, 0, 0, 0);
    return sel.getTime() > lim.getTime();
  }, [year, month, day]);

  return (
    <section className="mt-6 grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2 -mb-2">
        <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur animate-in fade-in-50">
          <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-blue-400 to-indigo-500" />
          <div className="ml-3 flex items-center gap-3">
            <Info className="mt-0.5 h-5 w-5 text-blue-300" aria-hidden="true" />
            <p className="m-0 text-xs text-white/90">カレンダーを押して日付と時間の指定ができます</p>
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-white/20 bg-white/90 p-6 shadow-lg backdrop-blur">
        <h2 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-zinc-700"><CalendarClock className="h-4 w-4 text-zinc-500" /> 日付を直接選択</h2>
        <div className="grid grid-cols-4 gap-3">
          <UnderLabelSelect value={year} setValue={setYear} options={yearOptions} underLabel="年" disabled={disabled} />
          <UnderLabelSelect value={month} setValue={setMonth} options={monthOptions} underLabel="月" disabled={disabled} />
          <UnderLabelSelect value={day} setValue={setDay} options={Array.from({ length: 31 }, (_, i) => i + 1)} underLabel="日" disabled={disabled} />
          <div className="flex flex-col items-center justify-center">
            <div className="text-base font-semibold text-zinc-900">{weekday || "X"}</div>
            <div className="text-xs text-zinc-500">曜日</div>
          </div>
        </div>
        {(!year || !month || !day) && (
          <p className="mt-1 text-xs text-red-600">日付の入力は必須です</p>
        )}
        <p className="mt-1 text-xs text-zinc-600">※下のカレンダー時間枠を選択することでも日付と時間を入力できます</p>
        {year != null && month != null && day != null && isPastDate && (
          <p className="mt-1 text-xs text-red-600">過去の日付は選択できません</p>
        )}
        {year != null && month != null && day != null && isBeyondOneMonth && (
          <p className="mt-1 text-xs text-red-600">1ヶ月以降先は選択できません</p>
        )}
      </div>
      <div className="rounded-2xl border border-white/20 bg-white/90 p-6 shadow-lg backdrop-blur">
        <h2 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-zinc-700"><Clock className="h-4 w-4 text-zinc-500" /> 時間を直接選択</h2>
        <div className="flex flex-wrap items-end gap-2 text-zinc-900 whitespace-nowrap">
          <UnderLabelSelect value={startHour} setValue={handleSetStartHour} options={hours} underLabel="時" disabled={disabled} />
          <div className="pb-4 text-lg text-zinc-500">:</div>
          <UnderLabelSelect value={startMin} setValue={setStartMin} options={startMinuteOptions} underLabel="分" disabled={disabled} />
          <div className="pb-4 text-lg text-zinc-400">~</div>
          <UnderLabelSelect value={endHour} setValue={handleSetEndHour} options={hours} underLabel="時" disabled={disabled} />
          <div className="pb-4 text-lg text-zinc-500">:</div>
          <UnderLabelSelect value={endMin} setValue={setEndMin} options={endMinuteOptions} underLabel="分" disabled={disabled} />
        </div>
        {(startHour == null || startMin == null || endHour == null || endMin == null) && (
          <p className="mt-2 text-xs text-red-600">時間の入力は必須です</p>
        )}
        <p className="mt-2 text-xs text-zinc-500">予約可能時間: 1ヶ月後までの月曜〜日曜 9:00 - 24:00</p>
        {(timeError || endBeforeOrEqualStart) ? (
          <p className="mt-2 text-xs text-red-600">{timeError || "終了は開始より後にしてください"}</p>
        ) : selectionInvalid ? (
          <p className="mt-2 text-xs text-red-600">{offlineHoursInvalid ? "オフラインの際その時間帯は選択できません" : "ご指定の時間では予約できません"}</p>
        ) : null}
      </div>
    </section>
  );
}


