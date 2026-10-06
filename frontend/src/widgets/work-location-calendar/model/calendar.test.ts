import { describe, expect, it } from "vitest";
import { buildMonth, formatDateLabel, formatYMD } from "./calendar";

describe("work-location calendar", () => {
  it("月曜始まりで月を並べる", () => {
    // 2026-10-01 は木曜
    const m = buildMonth(new Date(2026, 9, 6), 0);
    expect(m.year).toBe(2026);
    expect(m.month).toBe(10);
    expect(formatYMD(m.weeks[0][0])).toBe("2026-09-28");
    expect(formatYMD(m.weeks.at(-1)!.at(-1)!)).toBe("2026-11-01");
    expect(m.weeks.every((w) => w.length === 7)).toBe(true);
  });
  it("年をまたぐ", () => {
    const m = buildMonth(new Date(2026, 11, 15), 1);
    expect([m.year, m.month]).toEqual([2027, 1]);
  });
  it("日付の表示", () => {
    expect(formatDateLabel("2026-10-06")).toBe("10/6（火）");
  });
});
