import type { CSSProperties } from "react";
import type { Level, MachineMemory } from "@/lib/capacity";

const fillClass: Record<Level, string> = { ok: "bg-accent", warn: "bg-warn", bad: "bg-bad" };

// 予約は「使っていないが渡さない」量。色だけに頼らないよう斜線にして、使用中（塗り）と形でも見分けられるようにする
const reservedStyle: CSSProperties = {
  backgroundImage: "repeating-linear-gradient(135deg, var(--s-other) 0 3px, transparent 3px 6px)",
};

/**
 * 横向きの使用量の棒。数字は必ず棒の外に文字で並べる前提なので、棒そのものは読み上げない（aria-hidden）
 */
export function UsageBar({ fill, level = "ok", size = "md" }: { fill: number; level?: Level; size?: "sm" | "md" }) {
  return (
    <div aria-hidden className={`w-full overflow-hidden rounded-full bg-surface-2 ring-1 ring-line ring-inset ${size === "sm" ? "h-1.5" : "h-2.5"}`}>
      <div className={`h-full rounded-full ${fillClass[level]}`} style={{ width: `${Math.max(0, Math.min(1, fill)) * 100}%` }} />
    </div>
  );
}

/** Mac mini 全体のメモリ。使用中・予約・空きを 1 本に積む。数字は凡例に文字で出す */
export function MachineMemoryBar({ m }: { m: MachineMemory }) {
  return (
    <div aria-hidden className="flex h-3.5 w-full overflow-hidden rounded bg-surface-2 ring-1 ring-line ring-inset">
      <div className={m.over ? "bg-bad" : "bg-accent"} style={{ width: `${m.segments.used * 100}%` }} />
      <div style={{ width: `${m.segments.reserved * 100}%`, ...reservedStyle }} />
    </div>
  );
}

/** 凡例の印。棒の区切りと同じ塗り・斜線 */
export function MachineKey({ kind, over = false }: { kind: "used" | "reserved" | "free"; over?: boolean }) {
  const base = "inline-block size-3 shrink-0 rounded-[3px] ring-1 ring-line ring-inset";
  if (kind === "used") return <span aria-hidden className={`${base} ${over ? "bg-bad" : "bg-accent"}`} />;
  if (kind === "reserved") return <span aria-hidden className={`${base} bg-surface-2`} style={reservedStyle} />;
  return <span aria-hidden className={`${base} bg-surface-2`} />;
}
