import type { Locale } from "./i18n";

// 空き時間の計算（予約ページ・ヘッダーで共用）。旧 src/app/reserve/page.tsx・Header.tsx と同じ規則
export type BusyInterval = { start: string; end: string };

export function pad(n: number) {
  return String(n).padStart(2, "0");
}

export const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;
export const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** 曜日（日本語の 1 文字）。予約 API に送る値・枠の文字列にも使うので、表示言語では変えない */
export function weekdayName(d: Date) {
  return WEEKDAYS[d.getDay()];
}

/** 画面に出す曜日（日本語は「月」、英語は「Mon」） */
export function weekdayLabel(d: Date, locale: Locale) {
  return (locale === "ja" ? WEEKDAYS : WEEKDAYS_EN)[d.getDay()];
}

/** その週の月曜 0:00（ブラウザの時刻） */
export function getMonday(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function isOverlappingBusy(start: Date, end: Date, busy: BusyInterval[]): boolean {
  const s = start.getTime();
  const e = end.getTime();
  return busy.some((b) => {
    const bs = new Date(b.start).getTime();
    const be = new Date(b.end).getTime();
    return Math.max(s, bs) < Math.min(e, be);
  });
}

/** 年末年始（12/29〜1/5）は予約できない */
export function isHolidayPeriod(d: Date) {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return (m === 12 && day >= 29) || (m === 1 && day <= 5);
}
