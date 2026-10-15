// 勤務場所カレンダーの日付計算（旧 src/app/location/page.tsx と同じ。ブラウザの日付で数える）

import type { L10n, Locale } from "@/shared/lib/i18n";

/** 曜日の見出し（月曜始まり。最後の 2 つが土・日） */
export const DAY_NAMES_MON_FIRST: L10n<readonly string[]> = {
  ja: ["月", "火", "水", "木", "金", "土", "日"],
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
};
const DAY_NAMES: L10n<readonly string[]> = {
  ja: ["日", "月", "火", "水", "木", "金", "土"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};

export function formatYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 7/1（火）・7/1 (Tue) */
export function formatDateLabel(dateStr: string, locale: Locale = "ja"): string {
  const date = new Date(dateStr + "T00:00:00");
  const day = DAY_NAMES[locale][date.getDay()];
  return locale === "ja" ? `${date.getMonth() + 1}/${date.getDate()}（${day}）` : `${date.getMonth() + 1}/${date.getDate()} (${day})`;
}

/** 今月から monthOffset か月後の月を、月曜始まりの週（7 日ずつ）に並べる */
export function buildMonth(now: Date, monthOffset: number) {
  const firstDay = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const lastDay = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7; // 月=0 … 日=6
  const cursor = new Date(firstDay);
  cursor.setDate(cursor.getDate() - startDow);

  const weeks: Date[][] = [];
  while (cursor <= lastDay) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return { year: firstDay.getFullYear(), month: firstDay.getMonth() + 1, weeks };
}
