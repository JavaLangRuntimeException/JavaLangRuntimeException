// 予約できる 30 分枠の規則（旧 src/app/reserve/page.tsx・src/feature/reserve/ui/WeekGrid.tsx と同じ）。
// 時刻はブラウザの時刻で数える（旧実装と同じ）。サーバー側でも日本時間で同じ確認をしている
import { isAskMeUnavailableLocation } from "@/entities/work-location/@x/slot";
import { getMonday, isHolidayPeriod, isOverlappingBusy, pad, weekdayName, type BusyInterval } from "@/shared/lib/busy";

export const SLOT_MS = 30 * 60 * 1000;
export const LEAD_MS = 2 * 60 * 60 * 1000;

export type BusinessHours = { start: number; end: number };
/** 通常は 9:00〜23:00、オフライン（対面）は 10:00〜21:00 */
export const ONLINE_HOURS: BusinessHours = { start: 9, end: 23 };
export const OFFLINE_HOURS: BusinessHours = { start: 10, end: 21 };

export function businessHoursFor(contactMethod: string): BusinessHours {
  return contactMethod === "offline" ? OFFLINE_HOURS : ONLINE_HOURS;
}

export function formatDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function oneMonthAfter(now: Date) {
  const d = new Date(now);
  d.setMonth(d.getMonth() + 1);
  return d;
}

export type SelectionContext = {
  now: number;
  oneMonthLater: Date;
  contactMethod: string;
  locations: Record<string, string>;
  busy: BusyInterval[];
};

/** 選んだ日時が予約できないか（旧 selectionInvalid） */
export function isSelectionInvalid(s: Date, e: Date, ctx: SelectionContext): boolean {
  if (!(e > s)) return true;
  if (s.getTime() <= ctx.now) return true;
  if (s.getTime() < ctx.now + LEAD_MS) return true;
  if (s.getTime() > ctx.oneMonthLater.getTime()) return true;
  // 12/29-1/5は予約不可
  if (isHolidayPeriod(s)) return true;
  if (isAskMeUnavailableLocation(ctx.locations[formatDateKey(s)])) return true;
  // オフラインは 10:00 - 21:00
  if (ctx.contactMethod === "offline") {
    const sMins = s.getHours() * 60 + s.getMinutes();
    const eMins = e.getHours() * 60 + e.getMinutes();
    if (!(sMins >= 10 * 60 && eMins <= 21 * 60)) return true;
  }
  return isOverlappingBusy(s, e, ctx.busy);
}

/** オフラインの時間帯（10:00 - 21:00）から外れているか */
export function isOfflineHoursInvalid(sh: number, sm: number, eh: number, em: number) {
  const sMins = sh * 60 + sm;
  const eMins = eh * 60 + em;
  return !(sMins >= 10 * 60 && eMins <= 21 * 60 && eMins > sMins);
}

/** 「YYYY/MM/DD(曜) HH:MM〜HH:MM」 */
export function formatSlotText(t: Date, end: Date) {
  return `${t.getFullYear()}/${pad(t.getMonth() + 1)}/${pad(t.getDate())}(${weekdayName(t)}) ${pad(t.getHours())}:${pad(t.getMinutes())}〜${pad(end.getHours())}:${pad(end.getMinutes())}`;
}

/** formatSlotText の逆。読めなければ null */
export function parseSlotText(text: string) {
  const m = text.match(/^(\d{4})\/(\d{2})\/(\d{2})\(.+\)\s+(\d{2}):(\d{2})〜(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [y, mo, d, sh, sm, eh, em] = m.slice(1).map(Number);
  return { year: y, month: mo, day: d, startHour: sh, startMin: sm, endHour: eh, endMin: em };
}

/** 2 時間後以降で最初に空いている 30 分枠（祝休日・対応不可日・1 か月先は除く）。見つからなければ "" */
export async function findNextAvailableSlot(opts: {
  now: Date;
  oneMonthLater: Date;
  hours: BusinessHours;
  locations: Record<string, string>;
  busyForWeek: (mondayIso: string) => Promise<BusyInterval[]>;
}): Promise<string> {
  const { hours, locations, oneMonthLater } = opts;
  const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), hours.start, 0, 0, 0);
  const dayEnd = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), hours.end, 0, 0, 0);
  const nextDay = (d: Date) => dayStart(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));
  const align = (d: Date) => {
    const t = new Date(d);
    const m = t.getMinutes();
    if (m > 0 && m <= 30) t.setMinutes(30, 0, 0);
    else if (m > 30) t.setHours(t.getHours() + 1, 0, 0, 0);
    else t.setSeconds(0, 0);
    return t;
  };
  const cache = new Map<string, BusyInterval[]>();
  let t = align(new Date(opts.now.getTime() + LEAD_MS));
  if (t < dayStart(t)) t = dayStart(t);
  if (t >= dayEnd(t)) t = nextDay(t);

  for (let guard = 0; guard < 2000 && t.getTime() <= oneMonthLater.getTime(); guard++) {
    if (isHolidayPeriod(t) || isAskMeUnavailableLocation(locations[formatDateKey(t)])) {
      t = nextDay(t);
      continue;
    }
    if (t < dayStart(t)) {
      t = dayStart(t);
      continue;
    }
    const end = new Date(t.getTime() + SLOT_MS);
    if (end > dayEnd(t)) {
      t = nextDay(t);
      continue;
    }
    const key = getMonday(t).toISOString();
    if (!cache.has(key)) cache.set(key, await opts.busyForWeek(key));
    if (!isOverlappingBusy(t, end, cache.get(key)!)) return formatSlotText(t, end);
    t = end;
  }
  return "";
}

export type DayContext = {
  now: Date;
  oneMonthLater: Date;
  hours: BusinessHours;
  locations: Record<string, string>;
  busy: BusyInterval[];
};

function startOfToday(now: Date) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** その日の営業時間内で、2 時間後以降かつ埋まっていない 30 分枠の数 */
function availableSlotCount(date: Date, ctx: DayContext) {
  const leadCutoff = ctx.now.getTime() + LEAD_MS;
  let count = 0;
  for (let hour = ctx.hours.start; hour < ctx.hours.end; hour++) {
    for (let min = 0; min < 60; min += 30) {
      const s = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, min, 0);
      const e = new Date(s.getTime() + SLOT_MS);
      if (s.getTime() < leadCutoff) continue;
      if (!isOverlappingBusy(s, e, ctx.busy)) count++;
    }
  }
  return count;
}

/** 予約可能な時間枠がない日（週カレンダーで赤くする） */
export function isDateUnavailable(date: Date, ctx: DayContext) {
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (dateStart.getTime() < startOfToday(ctx.now).getTime()) return true;
  if (dateStart.getTime() > ctx.oneMonthLater.getTime()) return true;
  if (isHolidayPeriod(date)) return true;
  if (isAskMeUnavailableLocation(ctx.locations[formatDateKey(date)])) return true;
  return availableSlotCount(date, ctx) === 0;
}

/** 予約可能な時間が残りわずか（3 枠以下）の日（週カレンダーで黄色くする） */
export function isDateLimited(date: Date, ctx: DayContext) {
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (dateStart.getTime() < startOfToday(ctx.now).getTime() || dateStart.getTime() > ctx.oneMonthLater.getTime()) return false;
  return availableSlotCount(date, ctx) <= 3;
}

export type CellState = "past" | "unavailable" | "blocked" | "selected" | "available";

/** 週カレンダーの 1 マス（30 分）の状態 */
export function cellState(cellStart: Date, ctx: DayContext & { selectedStart: Date; selectedEnd: Date }): CellState {
  const cellEnd = new Date(cellStart.getTime() + SLOT_MS);
  if (cellEnd.getTime() <= ctx.now.getTime()) return "past";
  const startMins = cellStart.getHours() * 60 + cellStart.getMinutes();
  const endMins = cellEnd.getHours() * 60 + cellEnd.getMinutes();
  const outsideBusiness = startMins < ctx.hours.start * 60 || endMins > ctx.hours.end * 60;
  if (
    cellStart.getTime() < ctx.now.getTime() + LEAD_MS ||
    cellStart.getTime() > ctx.oneMonthLater.getTime() ||
    outsideBusiness ||
    isHolidayPeriod(cellStart) ||
    isAskMeUnavailableLocation(ctx.locations[formatDateKey(cellStart)])
  ) {
    return "unavailable";
  }
  if (isOverlappingBusy(cellStart, cellEnd, ctx.busy)) return "blocked";
  if (cellEnd > ctx.selectedStart && cellStart < ctx.selectedEnd) return "selected";
  return "available";
}

/** マスの文言（旧実装と同じ） */
export const CELL_LABEL: Record<CellState, string> = {
  past: "過去",
  unavailable: "不可",
  blocked: "不可",
  selected: "選択中",
  available: "可",
};
