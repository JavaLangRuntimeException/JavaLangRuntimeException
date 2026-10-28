// 数値と時刻の表示。単位は API の Series.unit（req/s・%・ms・mcores・bytes）

const KIB = 1024;
const BYTE_UNITS = ["B", "KiB", "MiB", "GiB", "TiB"] as const;

/** 有効桁を保ちつつ、末尾の 0 を落とす（12.50 → 12.5、3.00 → 3） */
function trim(value: number, digits: number): string {
  return Number(value.toFixed(digits)).toLocaleString("en-US", { maximumFractionDigits: digits });
}

/** 大きさに合わせて小数の桁数を決める（100 以上は整数、10 以上は 1 桁、それ未満は 2 桁） */
function auto(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 100) return trim(value, 0);
  if (abs >= 10) return trim(value, 1);
  return trim(value, 2);
}

/** bytes をいちばん読みやすい 2 進の単位にそろえたときの指数（0 = B, 2 = MiB, 3 = GiB） */
export function byteExponent(bytes: number): number {
  let exp = 0;
  let v = Math.abs(bytes);
  while (v >= KIB && exp < BYTE_UNITS.length - 1) {
    v /= KIB;
    exp++;
  }
  return exp;
}

export function formatBytes(bytes: number, exp = byteExponent(bytes)): string {
  return `${auto(bytes / KIB ** exp)} ${BYTE_UNITS[exp]}`;
}

/** 値を単位付きの文字列にする。知らない単位は数値の後ろにそのまま付ける */
export function formatValue(value: number, unit: string): string {
  if (!Number.isFinite(value)) return "—";
  switch (unit) {
    case "bytes":
      return formatBytes(value);
    case "mcores":
      return Math.abs(value) >= 1000 ? `${auto(value / 1000)} cores` : `${trim(value, 0)} mcores`;
    case "%":
      return `${auto(value)}%`;
    case "ms":
      return Math.abs(value) >= 1000 ? `${auto(value / 1000)} s` : `${auto(value)} ms`;
    case "req/s":
      return `${auto(value)} req/s`;
    default:
      return unit ? `${auto(value)} ${unit}` : auto(value);
  }
}

/**
 * 軸の目盛り用。1 本の軸の中では単位をそろえる（256 MiB と 1 GiB を混ぜず、0.25 GiB / 1 GiB にする）。
 * `max` は軸の上端の値
 */
export function formatTick(value: number, unit: string, max: number): string {
  switch (unit) {
    case "bytes":
      return formatBytes(value, byteExponent(max));
    case "mcores":
      return max >= 1000 ? `${trim(value / 1000, 2)} cores` : `${trim(value, 0)} m`;
    case "ms":
      return max >= 1000 ? `${trim(value / 1000, 2)} s` : `${trim(value, 1)} ms`;
    case "%":
      return `${trim(value, 2)}%`;
    case "req/s":
      return trim(value, 2);
    default:
      return trim(value, 2);
  }
}

// 時刻はすべて日本時間で出す（ブラウザのタイムゾーンに左右されない）
const hm = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const md = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" });

/** 軸の時刻ラベル。1h / 1d は「14:00」、7d は「10/22」 */
export function formatTimeTick(ms: number, range: string): string {
  return range === "7d" ? md.format(ms) : hm.format(ms);
}

/** ツールチップの時刻（「10/22 14:05」） */
export function formatDateTime(ms: number): string {
  return `${md.format(ms)} ${hm.format(ms)}`;
}
