// API の Series を、グラフ 1 枚ぶんの線の集まりにまとめる

export type MetricDef = { id: string; title: string; unit: string; description: string; additive: boolean };

/** 並べる順。ここにない id が来たら、後ろに id のまま並べる */
export const metricDefs: MetricDef[] = [
  { id: "requests", title: "リクエスト数", unit: "req/s", description: "1 秒あたりのリクエスト数", additive: true },
  { id: "errors_5xx", title: "5xx エラーの割合", unit: "%", description: "応答のうち 5xx だったものの割合", additive: false },
  { id: "latency_p95", title: "応答時間（p95）", unit: "ms", description: "95% のリクエストがこの時間内に返った", additive: false },
  { id: "cpu", title: "CPU 使用量", unit: "mcores", description: "1000 mcores = 1 コア", additive: true },
  { id: "memory", title: "メモリ使用量", unit: "bytes", description: "コンテナが使っているメモリ", additive: true },
];

export type RawSeries = { metric: string; group: string; unit: string; timestampsMs: readonly bigint[]; values: readonly number[] };
export type Point = { t: number; v: number };
export type ChartSeries = { key: string; label: string; color: string; points: Point[] };

/** 色の枠は 8 本まで（9 本目の色は作らない）。超えたら 7 本 + 「その他」 */
export const MAX_SERIES = 8;
const OTHER_COLOR = "var(--s-other)";

export function toPoints(s: Pick<RawSeries, "timestampsMs" | "values">): Point[] {
  const n = Math.min(s.timestampsMs.length, s.values.length);
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) pts.push({ t: Number(s.timestampsMs[i]), v: s.values[i] });
  return pts.sort((a, b) => a.t - b.t);
}

function mean(points: Point[]): number {
  const vs = points.map((p) => p.v).filter(Number.isFinite);
  return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : 0;
}

export type ChartData = { series: ChartSeries[]; omitted: number };

/**
 * 1 つの metric の系列を線にする。
 * - 色は名前順に固定の順で割り当てる（値の大小で色が入れ替わらない）
 * - 9 本以上あるときは平均の大きい 7 本を残し、残りは足せる量なら「その他」に合計、足せない量（割合・p95）は省いて数を返す
 */
export function buildChartData(raw: readonly RawSeries[], additive: boolean): ChartData {
  const all = raw.map((s) => ({ group: s.group, points: toPoints(s) })).filter((s) => s.points.length > 0);
  let kept = all;
  let rest: typeof all = [];
  if (all.length > MAX_SERIES) {
    const ranked = [...all].sort((a, b) => mean(b.points) - mean(a.points));
    kept = ranked.slice(0, MAX_SERIES - 1);
    rest = ranked.slice(MAX_SERIES - 1);
  }
  kept = [...kept].sort((a, b) => a.group.localeCompare(b.group));
  const series: ChartSeries[] = kept.map((s, i) => ({
    key: s.group || "__total",
    label: s.group || "全体",
    color: `var(--s${i + 1})`,
    points: s.points,
  }));
  if (rest.length > 0 && additive) {
    const sum = new Map<number, number>();
    for (const s of rest) for (const p of s.points) if (Number.isFinite(p.v)) sum.set(p.t, (sum.get(p.t) ?? 0) + p.v);
    series.push({
      key: "__other",
      label: `その他（${rest.length} 件）`,
      color: OTHER_COLOR,
      points: [...sum].map(([t, v]) => ({ t, v })).sort((a, b) => a.t - b.t),
    });
    return { series, omitted: 0 };
  }
  return { series, omitted: rest.length };
}

/** 系列の要約（表で見るとき）。最新・平均・最大 */
export function summarize(points: Point[]): { last: number; mean: number; max: number } {
  const vs = points.map((p) => p.v).filter(Number.isFinite);
  if (vs.length === 0) return { last: Number.NaN, mean: Number.NaN, max: Number.NaN };
  return { last: vs[vs.length - 1], mean: vs.reduce((a, b) => a + b, 0) / vs.length, max: Math.max(...vs) };
}
