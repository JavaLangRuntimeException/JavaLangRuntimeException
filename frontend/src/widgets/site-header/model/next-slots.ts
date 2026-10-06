import { fetchBusy } from "@/entities/slot";
import { getMonday, isOverlappingBusy, pad, weekdayName, type BusyInterval } from "@/shared/lib/busy";

/** 2 時間後以降・9:00〜23:00・1 か月以内で、空いている 30 分枠を先頭から 5 つ（旧 Header.tsx と同じ） */
export async function computeNextFiveSlots(now = new Date()): Promise<string[]> {
  const results: string[] = [];
  const cache = new Map<string, BusyInterval[]>();
  const step = 30 * 60 * 1000;
  const oneMonthLater = new Date(now);
  oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
  const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0, 0, 0);
  const dayEnd = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 0, 0, 0);
  const align = (d: Date) => {
    const t = new Date(d);
    const m = t.getMinutes();
    if (m > 0 && m <= 30) t.setMinutes(30, 0, 0);
    else if (m > 30) t.setHours(t.getHours() + 1, 0, 0, 0);
    else t.setSeconds(0, 0);
    return t;
  };
  let t = align(new Date(now.getTime() + 2 * 60 * 60 * 1000));
  if (t < dayStart(t)) t = dayStart(t);
  if (t >= dayEnd(t)) t = dayStart(new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1));

  const busyFor = async (date: Date) => {
    const key = getMonday(date).toISOString();
    if (!cache.has(key)) cache.set(key, await fetchBusy(key));
    return cache.get(key)!;
  };

  let guard = 0;
  while (results.length < 5 && guard < 2000 && t.getTime() <= oneMonthLater.getTime()) {
    guard += 1;
    if (t < dayStart(t)) {
      t = dayStart(t);
      continue;
    }
    const end = new Date(t.getTime() + step);
    if (end > dayEnd(t)) {
      t = dayStart(new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1));
      continue;
    }
    if (!isOverlappingBusy(t, end, await busyFor(t))) {
      results.push(`${t.getMonth() + 1}/${pad(t.getDate())}(${weekdayName(t)}) ${pad(t.getHours())}:${pad(t.getMinutes())}〜`);
    }
    t = end;
  }
  return results;
}
