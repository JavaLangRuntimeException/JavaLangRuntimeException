export type Status = "ok" | "degraded" | "down";

const color: Record<Status, string> = { ok: "bg-ok", degraded: "bg-warn", down: "bg-bad" };
const label: Record<Status, string> = { ok: "稼働中", degraded: "一部停止", down: "停止" };

export function statusOf(ready: number, desired: number): Status {
  if (desired > 0 && ready >= desired) return "ok";
  if (ready > 0) return "degraded";
  return desired === 0 ? "degraded" : "down";
}

/** 色だけに頼らず、必ず文字のラベルを添える */
export function StatusDot({ status }: { status: Status }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={`size-2 rounded-full ${color[status]}`} />
      <span className="text-ink-2">{label[status]}</span>
    </span>
  );
}
