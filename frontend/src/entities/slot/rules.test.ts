import { describe, expect, it, vi } from "vitest";

// 勤務場所スライスの API クライアントはブラウザ前提なので読み込ませない
vi.mock("@/shared/api/clients", () => ({}));
import {
  cellState,
  findNextAvailableSlot,
  formatSlotText,
  isDateLimited,
  isDateUnavailable,
  isOfflineHoursInvalid,
  isSelectionInvalid,
  ONLINE_HOURS,
  parseSlotText,
} from "./rules";

// 2026-10-06(火) 10:00（ブラウザの時刻）
const now = new Date(2026, 9, 6, 10, 0);
const oneMonthLater = new Date(2026, 10, 6, 10, 0);
const at = (d: number, h: number, m = 0, month = 9) => new Date(2026, month, d, h, m);
const ctx = { now: now.getTime(), oneMonthLater, contactMethod: "meet", locations: {}, busy: [] };

describe("isSelectionInvalid", () => {
  it("2 時間後以降なら可", () => {
    expect(isSelectionInvalid(at(6, 12), at(6, 12, 30), ctx)).toBe(false);
    expect(isSelectionInvalid(at(6, 11, 30), at(6, 12), ctx)).toBe(true);
  });
  it("終了が開始以前・1 か月より先・年末年始は不可", () => {
    expect(isSelectionInvalid(at(7, 12), at(7, 12), ctx)).toBe(true);
    expect(isSelectionInvalid(at(7, 12), at(7, 11), ctx)).toBe(true);
    expect(isSelectionInvalid(at(7, 12, 0, 10), at(7, 12, 30, 10), ctx)).toBe(true);
    expect(isSelectionInvalid(new Date(2026, 11, 29, 12), new Date(2026, 11, 29, 13), { ...ctx, oneMonthLater: new Date(2027, 1, 1) })).toBe(true);
  });
  it("対応不可日・埋まっている時間・オフラインの時間外は不可", () => {
    expect(isSelectionInvalid(at(7, 12), at(7, 13), { ...ctx, locations: { "2026-10-07": "対応不可日・休日" } })).toBe(true);
    expect(isSelectionInvalid(at(7, 12), at(7, 13), { ...ctx, busy: [{ start: at(7, 12, 30).toISOString(), end: at(7, 14).toISOString() }] })).toBe(true);
    expect(isSelectionInvalid(at(7, 21), at(7, 21, 30), { ...ctx, contactMethod: "offline" })).toBe(true);
    expect(isSelectionInvalid(at(7, 20), at(7, 21), { ...ctx, contactMethod: "offline" })).toBe(false);
  });
});

describe("isOfflineHoursInvalid", () => {
  it("10:00〜21:00 の中で終了が後なら可", () => {
    expect(isOfflineHoursInvalid(10, 0, 21, 0)).toBe(false);
    expect(isOfflineHoursInvalid(9, 30, 10, 30)).toBe(true);
    expect(isOfflineHoursInvalid(12, 0, 12, 0)).toBe(true);
  });
});

describe("slot text", () => {
  it("往復できる", () => {
    const text = formatSlotText(at(7, 9), at(7, 9, 30));
    expect(text).toBe("2026/10/07(水) 09:00〜09:30");
    expect(parseSlotText(text)).toEqual({ year: 2026, month: 10, day: 7, startHour: 9, startMin: 0, endHour: 9, endMin: 30 });
    expect(parseSlotText("bad")).toBeNull();
  });
});

describe("findNextAvailableSlot", () => {
  it("埋まっている時間・対応不可日を飛ばす", async () => {
    const text = await findNextAvailableSlot({
      now,
      oneMonthLater,
      hours: ONLINE_HOURS,
      locations: { "2026-10-07": "対応不可日・休日" },
      busyForWeek: async () => [{ start: at(6, 12).toISOString(), end: at(6, 23).toISOString() }],
    });
    expect(text).toBe("2026/10/08(木) 09:00〜09:30");
  });
  it("夜遅くなら翌日の始業から", async () => {
    const text = await findNextAvailableSlot({ now: at(6, 22), oneMonthLater, hours: ONLINE_HOURS, locations: {}, busyForWeek: async () => [] });
    expect(text).toBe("2026/10/07(水) 09:00〜09:30");
  });
});

describe("day / cell state", () => {
  const day = { now, oneMonthLater, hours: ONLINE_HOURS, locations: {}, busy: [] };
  it("過去・1 か月先・終日埋まりは予約不可、3 枠以下は残りわずか", () => {
    expect(isDateUnavailable(at(5, 0), day)).toBe(true);
    expect(isDateUnavailable(at(10, 0, 0, 10), day)).toBe(true);
    expect(isDateUnavailable(at(7, 0), { ...day, busy: [{ start: at(7, 9).toISOString(), end: at(7, 23).toISOString() }] })).toBe(true);
    expect(isDateLimited(at(7, 0), { ...day, busy: [{ start: at(7, 9).toISOString(), end: at(7, 21, 30).toISOString() }] })).toBe(true);
    expect(isDateLimited(at(7, 0), day)).toBe(false);
  });
  it("マスの状態", () => {
    const c = { ...day, selectedStart: at(7, 12), selectedEnd: at(7, 13), busy: [{ start: at(7, 15).toISOString(), end: at(7, 16).toISOString() }] };
    expect(cellState(at(6, 9), c)).toBe("past");
    expect(cellState(at(6, 11), c)).toBe("unavailable");
    expect(cellState(at(7, 12, 30), c)).toBe("selected");
    expect(cellState(at(7, 15), c)).toBe("blocked");
    expect(cellState(at(7, 14), c)).toBe("available");
  });
});
