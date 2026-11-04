// 折れ線グラフの軸の計算（描画から切り離してテストする）

import { byteExponent } from "./format";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** 1・2・2.5・5 × 10^n のうち、raw 以上で最小のきざみ */
export function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * pow;
}

export type YScale = { max: number; ticks: number[] };

/**
 * y 軸は 0 から始める（ここで扱う値はどれも 0 以上の量なので、0 を省くと差を大きく見せてしまう）。
 * 上端はデータの最大値を含むきりのよい値。bytes は 2 進の単位（MiB / GiB）できりよくする
 */
export function yScale(dataMax: number, unit: string, count = 4): YScale {
  const top = Number.isFinite(dataMax) && dataMax > 0 ? dataMax : 0;
  const base = unit === "bytes" && top > 0 ? 1024 ** byteExponent(top) : 1;
  const scaled = top / base;
  if (scaled === 0) {
    // データが全部 0（またはない）ときも、軸の形は保つ
    return { max: base, ticks: [0, base] };
  }
  const step = niceStep(scaled / count);
  const n = Math.max(1, Math.ceil(scaled / step - 1e-9));
  const ticks = Array.from({ length: n + 1 }, (_, i) => round(i * step) * base);
  return { max: ticks[ticks.length - 1], ticks };
}

function round(v: number): number {
  return Number(v.toPrecision(12));
}

/** domain の値を range へ写す一次関数 */
export function linear(domain: [number, number], range: [number, number]): (v: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  return (v) => r0 + ((v - d0) / span) * (r1 - r0);
}

/** 表示期間ごとの時刻の目盛りの間隔 */
export function timeStep(range: string): number {
  switch (range) {
    case "1h":
      return 10 * MINUTE;
    case "1d":
      return 3 * HOUR;
    default:
      return DAY;
  }
}

/** [start, end] に入る、日本時間できりのよい時刻（10 分・3 時間・0 時ちょうど）の目盛り */
export function timeTicks(start: number, end: number, range: string): number[] {
  if (!(end > start)) return [];
  const step = timeStep(range);
  const first = Math.ceil((start + JST_OFFSET_MS) / step) * step - JST_OFFSET_MS;
  const ticks: number[] = [];
  for (let t = first; t <= end; t += step) ticks.push(t);
  return ticks;
}

/** 並んだ時刻のうち x にいちばん近いものの添字（二分探索）。空なら -1 */
export function nearestIndex(sorted: readonly number[], x: number): number {
  if (sorted.length === 0) return -1;
  let lo = 0;
  let hi = sorted.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= x) lo = mid;
    else hi = mid;
  }
  return Math.abs(sorted[hi] - x) < Math.abs(sorted[lo] - x) ? hi : lo;
}

/**
 * 折れ線を path の d 属性にする。取得の間隔の 2.5 倍より長く空いたところは線をつながない
 * （止まっていた時間を、直線で埋めて「あった」ように見せない）
 */
export function linePath(
  points: readonly { t: number; v: number }[],
  x: (t: number) => number,
  y: (v: number) => number,
): string {
  const pts = points.filter((p) => Number.isFinite(p.v));
  if (pts.length === 0) return "";
  const gaps = pts.slice(1).map((p, i) => p.t - pts[i].t).sort((a, b) => a - b);
  const typical = gaps.length ? gaps[gaps.length >> 1] : Infinity;
  let d = "";
  pts.forEach((p, i) => {
    const broke = i === 0 || p.t - pts[i - 1].t > typical * 2.5;
    d += `${broke ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`;
  });
  return d;
}
