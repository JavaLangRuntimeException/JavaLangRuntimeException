// 容量の画面の計算。API の int64 は bigint で来るので、ここで number にそろえてから扱う

/** bigint / 未設定をまとめて number にする（メモリの GiB 程度なら number で誤差は出ない） */
export function num(v: bigint | number | undefined): number {
  return v == null ? 0 : Number(v);
}

export type Usage = {
  used: number;
  limit: number;
  /** 枠が決まっていない（limit が 0）。割合は出さず「枠なし」と書く */
  unlimited: boolean;
  /** 棒の長さ（0〜1 に収める）。枠を超えていても棒ははみ出させない */
  fill: number;
  /** 本当の割合（%）。枠を超えると 100 を超える。枠なしのときは null */
  percent: number | null;
};

export function usage(a: { used: bigint | number; limit: bigint | number } | undefined): Usage {
  const used = Math.max(0, num(a?.used));
  const limit = Math.max(0, num(a?.limit));
  if (limit === 0) return { used, limit, unlimited: true, fill: 0, percent: null };
  const ratio = used / limit;
  return { used, limit, unlimited: false, fill: Math.min(1, ratio), percent: ratio * 100 };
}

/** 割合の表示。0 より大きく 1% 未満は「<1%」（0% と書くと何も使っていないように見える） */
export function formatPercent(percent: number | null): string {
  if (percent == null || !Number.isFinite(percent)) return "—";
  if (percent > 0 && percent < 1) return "<1%";
  return `${Math.round(percent)}%`;
}

export type Level = "ok" | "warn" | "bad";

/** 棒の色の段階。8 割で注意、95% で危険（枠いっぱいになるとデプロイが拒否される） */
export function levelOf(u: Pick<Usage, "unlimited" | "percent">): Level {
  if (u.unlimited || u.percent == null) return "ok";
  if (u.percent >= 95) return "bad";
  if (u.percent >= 80) return "warn";
  return "ok";
}

/** ミリコアを CPU の数で出す（250 → 0.25 CPU）。アプリの大きさは CPU の数で考えるほうがわかりやすい */
export function formatCpu(millis: number): string {
  return `${Number((millis / 1000).toFixed(3)).toLocaleString("en-US", { maximumFractionDigits: 3 })} CPU`;
}

const limitedByLabels: Record<string, string> = {
  quota_memory: "この環境の枠（メモリ）",
  quota_cpu: "この環境の枠（CPU）",
  quota_pods: "この環境の枠（Pod 数）",
  machine_memory: "Mac mini の空きメモリ",
};

/** 何が先に足りなくなるか。知らない値が来たらそのまま出す（API が先に増えても画面が壊れない） */
export function limitedByLabel(code: string): string {
  return limitedByLabels[code] ?? (code || "—");
}

/** s / m / l / xl を画面では大文字にする */
export function sizeLabel(name: string): string {
  return name.toUpperCase();
}

export type MachineMemory = {
  total: number;
  used: number;
  reserved: number;
  free: number;
  /** 使用中 + 予約が全体を超えている（予約を割り込んでいるので、アプリは足せない） */
  over: boolean;
  /** 足りない量（over のときだけ 0 より大きい） */
  shortage: number;
  /** 棒の各区切りの幅（0〜1）。合計は 1 以下。超えたときは使用中を優先し、予約を残りに詰める */
  segments: { used: number; reserved: number; free: number };
};

export function machineMemory(m: { memoryTotal: bigint | number; memoryUsed: bigint | number; memoryReserved: bigint | number } | undefined): MachineMemory {
  const total = Math.max(0, num(m?.memoryTotal));
  const used = Math.max(0, num(m?.memoryUsed));
  const reserved = Math.max(0, num(m?.memoryReserved));
  const shortage = Math.max(0, used + reserved - total);
  const free = Math.max(0, total - used - reserved);
  if (total === 0) {
    return { total, used, reserved, free, over: shortage > 0, shortage, segments: { used: 0, reserved: 0, free: 0 } };
  }
  const u = Math.min(1, used / total);
  const r = Math.min(1 - u, reserved / total);
  return { total, used, reserved, free, over: shortage > 0, shortage, segments: { used: u, reserved: r, free: Math.max(0, 1 - u - r) } };
}

/** 概要のカードで出す大きさ。ふだん基準にする M を探し、なければ最初のもの */
export function pickFit<T extends { name: string }>(fits: readonly T[], preferred = "m"): T | undefined {
  return fits.find((f) => f.name.toLowerCase() === preferred) ?? fits[0];
}
