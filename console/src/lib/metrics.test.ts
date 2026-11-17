import { describe, expect, it } from "vitest";
import { buildChartData, summarize, type RawSeries } from "./metrics";

const s = (group: string, values: number[]): RawSeries => ({
  metric: "requests",
  group,
  unit: "req/s",
  timestampsMs: values.map((_, i) => BigInt(i * 1000)),
  values,
});

describe("buildChartData", () => {
  it("色は名前順に固定で割り当てる（値の大きさによらない）", () => {
    const { series } = buildChartData([s("b.example", [9]), s("a.example", [1])], true);
    expect(series.map((x) => [x.label, x.color])).toEqual([
      ["a.example", "var(--s1)"],
      ["b.example", "var(--s2)"],
    ]);
  });

  it("group が空なら「全体」", () => {
    expect(buildChartData([s("", [1, 2])], true).series[0].label).toBe("全体");
  });

  it("点のない系列は捨てる", () => {
    expect(buildChartData([s("x", [])], true).series).toEqual([]);
  });

  it("9 本以上は、足せる量なら 7 本 + その他（合計）", () => {
    const raw = Array.from({ length: 10 }, (_, i) => s(`h${i}`, [i, i]));
    const { series, omitted } = buildChartData(raw, true);
    expect(series).toHaveLength(8);
    expect(omitted).toBe(0);
    const other = series[7];
    expect(other.label).toBe("その他（3 件）");
    // 小さい 3 本（0, 1, 2）の合計
    expect(other.points).toEqual([
      { t: 0, v: 3 },
      { t: 1000, v: 3 },
    ]);
  });

  it("足せない量（割合）は省いた数を返す", () => {
    const raw = Array.from({ length: 9 }, (_, i) => s(`h${i}`, [i]));
    const { series, omitted } = buildChartData(raw, false);
    expect(series).toHaveLength(7);
    expect(omitted).toBe(2);
  });
});

describe("summarize", () => {
  it("最新・平均・最大", () => {
    expect(summarize([{ t: 0, v: 1 }, { t: 1, v: 5 }, { t: 2, v: 3 }])).toEqual({ last: 3, mean: 3, max: 5 });
    expect(Number.isNaN(summarize([]).last)).toBe(true);
  });
});
