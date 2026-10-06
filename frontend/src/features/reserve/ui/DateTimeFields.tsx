import { useMemo } from "react";
import { RiCalendarScheduleLine, RiTimeLine } from "@remixicon/react";
import { FieldCard, FieldError, FieldNote, Notice, NumberSelect } from "./parts";

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

/** 年末年始の案内は 11/29〜1/5 の間だけ出す */
function holidayNoticeVisible(now = new Date()) {
  const m = now.getMonth() + 1;
  const d = now.getDate();
  return (m === 11 && d >= 29) || m === 12 || (m === 1 && d <= 5);
}

export type DateTimeFieldsProps = {
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
};

/** 日付と時間を直接選ぶ（文言・確認は旧 DateTimeFields と同じ） */
export function DateTimeFields(p: DateTimeFieldsProps) {
  const { year, month, day, startHour, startMin, endHour, endMin } = p;
  // 23時の場合は00分のみ選択可能
  const startMinuteOptions = startHour === 23 ? [0] : p.minuteOptions;
  const endMinuteOptions = endHour === 23 ? [0] : p.minuteOptions;
  const setStartHour = (h: number) => {
    p.setStartHour(h);
    if (h === 23 && startMin !== 0) p.setStartMin(0);
  };
  const setEndHour = (h: number) => {
    p.setEndHour(h);
    if (h === 23 && endMin !== 0) p.setEndMin(0);
  };

  const hasDate = year != null && month != null && day != null;
  const endBeforeOrEqualStart =
    startHour != null && startMin != null && endHour != null && endMin != null && (endHour < startHour || (endHour === startHour && endMin <= startMin));
  const { isPastDate, isBeyondOneMonth, isHoliday } = useMemo(() => {
    if (year == null || month == null || day == null) return { isPastDate: false, isBeyondOneMonth: false, isHoliday: false };
    const sel = new Date(year, month - 1, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lim = new Date();
    lim.setMonth(lim.getMonth() + 1);
    lim.setHours(0, 0, 0, 0);
    return {
      isPastDate: sel.getTime() < today.getTime(),
      isBeyondOneMonth: sel.getTime() > lim.getTime(),
      isHoliday: (month === 12 && day >= 29) || (month === 1 && day <= 5),
    };
  }, [year, month, day]);

  return (
    <div className="flex flex-col gap-4">
      <Notice>予約可能時間: 1ヶ月後までの月曜〜日曜 9:00 - 23:00(JST)</Notice>
      {holidayNoticeVisible() && <Notice tone="error">12/29-翌年1/5の期間は予約できません</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldCard title="日付を直接選択" icon={RiCalendarScheduleLine}>
          <div className="flex items-start gap-2">
            <NumberSelect value={year} onChange={p.setYear} options={p.yearOptions} underLabel="年" disabled={p.disabled} pad={false} />
            <NumberSelect value={month} onChange={p.setMonth} options={p.monthOptions} underLabel="月" disabled={p.disabled} />
            <NumberSelect value={day} onChange={p.setDay} options={DAYS} underLabel="日" disabled={p.disabled} />
            <div className="flex w-10 shrink-0 flex-col items-center gap-1">
              <div className="flex h-9 items-center text-headline-semibold text-text-primary">{p.weekday || "X"}</div>
              <span className="text-caption-1-regular text-text-tertiary">曜日</span>
            </div>
          </div>
          <FieldError>{!year || !month || !day ? "日付の入力は必須です" : undefined}</FieldError>
          <FieldNote>※下のカレンダー時間枠を選択することでも日付と時間を入力できます</FieldNote>
          {hasDate && isPastDate && <FieldError>過去の日付は選択できません</FieldError>}
          {hasDate && isBeyondOneMonth && <FieldError>1ヶ月以降先は選択できません</FieldError>}
          {hasDate && isHoliday && <FieldError>12/29-1/5の期間は予約できません</FieldError>}
        </FieldCard>
        <FieldCard title="時間を直接選択" icon={RiTimeLine}>
          <div className="flex items-start gap-1.5">
            <NumberSelect value={startHour} onChange={setStartHour} options={p.hours} underLabel="時" disabled={p.disabled} />
            <span className="pt-1.5 text-headline-regular text-text-tertiary" aria-hidden>
              :
            </span>
            <NumberSelect value={startMin} onChange={p.setStartMin} options={startMinuteOptions} underLabel="分" disabled={p.disabled} />
            <span className="pt-1.5 text-headline-regular text-text-tertiary" aria-hidden>
              ~
            </span>
            <NumberSelect value={endHour} onChange={setEndHour} options={p.hours} underLabel="時" disabled={p.disabled} />
            <span className="pt-1.5 text-headline-regular text-text-tertiary" aria-hidden>
              :
            </span>
            <NumberSelect value={endMin} onChange={p.setEndMin} options={endMinuteOptions} underLabel="分" disabled={p.disabled} />
          </div>
          <FieldError>{startHour == null || startMin == null || endHour == null || endMin == null ? "時間の入力は必須です" : undefined}</FieldError>
          {p.timeError || endBeforeOrEqualStart ? (
            <FieldError>{p.timeError || "終了は開始より後にしてください"}</FieldError>
          ) : p.selectionInvalid ? (
            <FieldError>{p.offlineHoursInvalid ? "オフラインの際その時間帯は選択できません" : "ご指定の時間では予約できません"}</FieldError>
          ) : null}
        </FieldCard>
      </div>
    </div>
  );
}
