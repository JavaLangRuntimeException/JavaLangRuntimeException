// 勤務場所カレンダーの日付計算（旧 src/app/location/page.tsx と同じ。ブラウザの日付で数える）

export const DAY_NAMES_MON_FIRST = ["月", "火", "水", "木", "金", "土", "日"] as const;
const DAY_NAMES_JP = ["日", "月", "火", "水", "木", "金", "土"] as const;

export function formatYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 7/1（火） */
export function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return `${date.getMonth() + 1}/${date.getDate()}（${DAY_NAMES_JP[date.getDay()]}）`;
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
