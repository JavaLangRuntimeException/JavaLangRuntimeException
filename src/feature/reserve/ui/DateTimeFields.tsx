"use client";

import React from "react";

function UnderLabelSelect({ value, setValue, options, underLabel }: { value: number | null; setValue: (n: number) => void; options: number[]; underLabel: string }) {
  return (
    <div className="flex flex-col items-center">
      <select className="w-full rounded-md border border-zinc-300 bg-white p-2 text-center text-zinc-900" value={value ?? ""} onChange={(e) => setValue(Number(e.target.value))}>
        <option value="" disabled hidden>
          --
        </option>
        {options.map((o) => (
          <option key={o} value={o}>
            {String(o).padStart(2, "0")}
          </option>
        ))}
      </select>
      <div className="mt-1 text-xs text-zinc-500">{underLabel}</div>
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
      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">日付</h2>
        <div className="grid grid-cols-4 gap-3">
          <UnderLabelSelect value={year} setValue={setYear} options={yearOptions} underLabel="年" />
          <UnderLabelSelect value={month} setValue={setMonth} options={monthOptions} underLabel="月" />
          <UnderLabelSelect value={day} setValue={setDay} options={Array.from({ length: 31 }, (_, i) => i + 1)} underLabel="日" />
          <div className="flex flex-col items-center justify-center">
            <div className="text-base font-semibold text-zinc-900">{weekday || "X"}</div>
            <div className="text-xs text-zinc-500">曜日</div>
          </div>
        </div>
        {(!year || !month || !day) && (
          <p className="mt-1 text-xs text-red-600">日付の入力は必須です</p>
        )}
        {year != null && month != null && day != null && isPastDate && (
          <p className="mt-1 text-xs text-red-600">過去の日付は選択できません</p>
        )}
        {year != null && month != null && day != null && isBeyondOneMonth && (
          <p className="mt-1 text-xs text-red-600">1ヶ月以降先は選択できません</p>
        )}
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">時間</h2>
        <div className="flex flex-wrap items-end gap-3 text-zinc-900">
          <UnderLabelSelect value={startHour} setValue={handleSetStartHour} options={hours} underLabel="時" />
          <div className="pb-4 text-lg text-zinc-500">:</div>
          <UnderLabelSelect value={startMin} setValue={setStartMin} options={startMinuteOptions} underLabel="分" />
          <div className="pb-4 text-lg text-zinc-400">~</div>
          <UnderLabelSelect value={endHour} setValue={handleSetEndHour} options={hours} underLabel="時" />
          <div className="pb-4 text-lg text-zinc-500">:</div>
          <UnderLabelSelect value={endMin} setValue={setEndMin} options={endMinuteOptions} underLabel="分" />
        </div>
        {(startHour == null || startMin == null || endHour == null || endMin == null) && (
          <p className="mt-2 text-xs text-red-600">時間の入力は必須です</p>
        )}
        <p className="mt-2 text-xs text-zinc-500">予約可能時間: 1ヶ月後までの月曜〜日曜 9:00 - 24:00</p>
        {(timeError || endBeforeOrEqualStart) ? (
          <p className="mt-2 text-xs text-red-600">{timeError || "終了は開始より後にしてください"}</p>
        ) : selectionInvalid ? (
          <p className="mt-2 text-xs text-red-600">ご指定の時間では予約できません</p>
        ) : null}
      </div>
    </section>
  );
}


