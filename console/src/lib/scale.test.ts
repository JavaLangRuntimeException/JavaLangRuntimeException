import { describe, expect, it } from "vitest";
import { linePath, linear, nearestIndex, niceStep, timeTicks, yScale } from "./scale";

describe("niceStep", () => {
  it("1・2・2.5・5 × 10^n に丸める", () => {
    expect(niceStep(0.7)).toBe(1);
    expect(niceStep(1.3)).toBe(2);
    expect(niceStep(2.2)).toBe(2.5);
    expect(niceStep(3)).toBe(5);
    expect(niceStep(7)).toBe(10);
    expect(niceStep(130)).toBe(200);
  });
});

describe("yScale", () => {
  it("0 から始まり、最大値を含むきりのよい上端にする", () => {
    expect(yScale(87, "ms")).toEqual({ max: 100, ticks: [0, 25, 50, 75, 100] });
    expect(yScale(3.2, "req/s").max).toBeGreaterThanOrEqual(3.2);
    expect(yScale(3.2, "req/s").ticks[0]).toBe(0);
  });

  it("bytes は 2 進の単位できりよくする", () => {
    const s = yScale(700 * 1024 ** 2, "bytes");
    const mib = s.ticks.map((t) => t / 1024 ** 2);
    expect(mib).toEqual([0, 200, 400, 600, 800]);
  });

  it("データが 0 だけ・空でも軸を作る", () => {
    expect(yScale(0, "%")).toEqual({ max: 1, ticks: [0, 1] });
    expect(yScale(Number.NEGATIVE_INFINITY, "ms").max).toBe(1);
  });
});

describe("linear", () => {
  it("domain を range に写す（y は上下が逆）", () => {
    const y = linear([0, 100], [200, 0]);
    expect(y(0)).toBe(200);
    expect(y(50)).toBe(100);
    expect(y(100)).toBe(0);
  });
});

describe("timeTicks", () => {
  it("1d は日本時間の 3 時間ごと", () => {
    const start = Date.UTC(2026, 9, 22, 0, 10); // 09:10 JST
    const end = Date.UTC(2026, 9, 22, 7, 0); // 16:00 JST
    const ticks = timeTicks(start, end, "1d");
    // 12:00, 15:00 JST
    expect(ticks).toEqual([Date.UTC(2026, 9, 22, 3, 0), Date.UTC(2026, 9, 22, 6, 0)]);
  });

  it("7d は日本時間の 0 時", () => {
    const start = Date.UTC(2026, 9, 20, 0, 0);
    const end = Date.UTC(2026, 9, 22, 0, 0);
    // JST 10/21 0:00 = 10/20 15:00 UTC, 10/22 0:00 JST = 10/21 15:00 UTC
    expect(timeTicks(start, end, "7d")).toEqual([Date.UTC(2026, 9, 20, 15), Date.UTC(2026, 9, 21, 15)]);
  });

  it("期間が空なら目盛りなし", () => {
    expect(timeTicks(10, 10, "1h")).toEqual([]);
  });
});

describe("nearestIndex", () => {
  it("いちばん近い時刻の添字", () => {
    expect(nearestIndex([0, 10, 20], 4)).toBe(0);
    expect(nearestIndex([0, 10, 20], 6)).toBe(1);
    expect(nearestIndex([0, 10, 20], 99)).toBe(2);
    expect(nearestIndex([], 1)).toBe(-1);
  });
});

describe("linePath", () => {
  const id = (v: number) => v;
  it("点を線でつなぐ", () => {
    expect(linePath([{ t: 0, v: 1 }, { t: 1, v: 2 }], id, id)).toBe("M0.0,1.0L1.0,2.0");
  });

  it("間隔がふだんより大きく空いたら線を切る", () => {
    const pts = [0, 1, 2, 10, 11].map((t) => ({ t, v: 0 }));
    expect(linePath(pts, id, id)).toBe("M0.0,0.0L1.0,0.0L2.0,0.0M10.0,0.0L11.0,0.0");
  });
});
