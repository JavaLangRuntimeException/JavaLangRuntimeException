import type { ReactNode } from "react";

// フォームの部品の見た目（色は styles.css の変数だけ）
export const input =
  "w-full rounded border border-line-strong bg-surface px-2.5 py-1.5 text-ink placeholder:text-muted disabled:bg-surface-2 disabled:text-muted";
export const btn = "rounded border border-line-strong px-3 py-1.5 font-medium text-ink hover:bg-surface-2 disabled:opacity-50";
export const btnPrimary = "rounded border border-accent bg-accent px-3 py-1.5 font-medium text-surface hover:opacity-90 disabled:opacity-50";
export const btnDanger = "rounded border border-line-strong px-3 py-1.5 font-medium text-bad hover:bg-surface-2 disabled:opacity-50";

/** ラベル付きの入力。間違いがあれば補足の代わりに出す */
export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-2">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-bad">{error}</span> : hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

const levelColor = { ok: "bg-ok", warn: "bg-warn", bad: "bg-bad", off: "bg-line-strong" } as const;

/** 状態の印。色だけに頼らず、必ず文字のラベルを添える */
export function Status({ level, label }: { level: keyof typeof levelColor; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={`size-2 rounded-full ${levelColor[level]}`} />
      <span className="text-ink-2">{label}</span>
    </span>
  );
}
