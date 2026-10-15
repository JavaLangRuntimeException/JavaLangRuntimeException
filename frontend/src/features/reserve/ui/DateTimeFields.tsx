import { useMemo } from "react";
import { weekdayLabel } from "@/shared/lib/busy";
import { useLocale, useT } from "@/shared/lib/i18n";
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
  const t = useT();
  const locale = useLocale();
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

  // 曜日は日付から表示する言語で出す（p.weekday は API に送る日本語の曜日）
  const weekday = hasDate ? weekdayLabel(new Date(year, month - 1, day), locale) : p.weekday;
  const hourLabel = t({ ja: "時", en: "Hour" });
  const minLabel = t({ ja: "分", en: "Min" });

  return (
    <div className="flex flex-col gap-4">
      <Notice>{t({ ja: "予約可能時間: 1ヶ月後までの月曜〜日曜 9:00 - 23:00(JST)", en: "Available hours: Monday to Sunday, 9:00 - 23:00 (JST), up to one month ahead" })}</Notice>
      {holidayNoticeVisible() && <Notice tone="error">{t({ ja: "12/29-翌年1/5の期間は予約できません", en: "Reservations are not available from 12/29 to 1/5 of the following year" })}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldCard title={t({ ja: "日付を直接選択", en: "Select a date" })}>
          <div className="flex items-start gap-2">
            <NumberSelect value={year} onChange={p.setYear} options={p.yearOptions} underLabel={t({ ja: "年", en: "Year" })} disabled={p.disabled} pad={false} />
            <NumberSelect value={month} onChange={p.setMonth} options={p.monthOptions} underLabel={t({ ja: "月", en: "Month" })} disabled={p.disabled} />
            <NumberSelect value={day} onChange={p.setDay} options={DAYS} underLabel={t({ ja: "日", en: "Day" })} disabled={p.disabled} />
            <div className="flex w-10 shrink-0 flex-col items-center gap-1">
              <div className="flex h-9 items-center text-headline-semibold text-text-primary">{weekday || "X"}</div>
              <span className="text-caption-1-regular text-text-tertiary">{t({ ja: "曜日", en: "Weekday" })}</span>
            </div>
          </div>
          <FieldError>{!year || !month || !day ? t({ ja: "日付の入力は必須です", en: "A date is required" }) : undefined}</FieldError>
          <FieldNote>{t({ ja: "※下のカレンダー時間枠を選択することでも日付と時間を入力できます", en: "* You can also pick a date and time by selecting a slot in the calendar below" })}</FieldNote>
          {hasDate && isPastDate && <FieldError>{t({ ja: "過去の日付は選択できません", en: "You cannot select a past date" })}</FieldError>}
          {hasDate && isBeyondOneMonth && <FieldError>{t({ ja: "1ヶ月以降先は選択できません", en: "You cannot select a date more than one month ahead" })}</FieldError>}
          {hasDate && isHoliday && <FieldError>{t({ ja: "12/29-1/5の期間は予約できません", en: "Reservations are not available from 12/29 to 1/5" })}</FieldError>}
        </FieldCard>
        <FieldCard title={t({ ja: "時間を直接選択", en: "Select a time" })}>
          <div className="flex items-start gap-1.5">
            <NumberSelect value={startHour} onChange={setStartHour} options={p.hours} underLabel={hourLabel} disabled={p.disabled} />
            <span className="pt-1.5 text-headline-regular text-text-tertiary" aria-hidden>
              :
            </span>
            <NumberSelect value={startMin} onChange={p.setStartMin} options={startMinuteOptions} underLabel={minLabel} disabled={p.disabled} />
            <span className="pt-1.5 text-headline-regular text-text-tertiary" aria-hidden>
              ~
            </span>
            <NumberSelect value={endHour} onChange={setEndHour} options={p.hours} underLabel={hourLabel} disabled={p.disabled} />
            <span className="pt-1.5 text-headline-regular text-text-tertiary" aria-hidden>
              :
            </span>
            <NumberSelect value={endMin} onChange={p.setEndMin} options={endMinuteOptions} underLabel={minLabel} disabled={p.disabled} />
          </div>
          <FieldError>{startHour == null || startMin == null || endHour == null || endMin == null ? t({ ja: "時間の入力は必須です", en: "A time is required" }) : undefined}</FieldError>
          {p.timeError || endBeforeOrEqualStart ? (
            <FieldError>{p.timeError || t({ ja: "終了は開始より後にしてください", en: "The end time must be after the start time" })}</FieldError>
          ) : p.selectionInvalid ? (
            <FieldError>{p.offlineHoursInvalid ? t({ ja: "オフラインの際その時間帯は選択できません", en: "This time is not available for in-person meetings" }) : t({ ja: "ご指定の時間では予約できません", en: "The selected time cannot be booked" })}</FieldError>
          ) : null}
        </FieldCard>
      </div>
    </div>
  );
}
