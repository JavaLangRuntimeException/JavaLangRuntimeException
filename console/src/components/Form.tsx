import type { ReactNode } from "react";

// フォームの部品の見た目（色は styles.css の変数だけ）
export const input =
  "w-full rounded border border-line-strong bg-surface px-2.5 py-1.5 text-ink placeholder:text-muted disabled:bg-surface-2 disabled:text-muted";
// ボタンは 3 種類: 主（橙。作る・保存する。1 つの面に 1 つ）・ふつう（白地に枠）・消す（赤い字）
const btnBase = "inline-flex items-center justify-center rounded-full border px-4 py-1 font-semibold whitespace-nowrap disabled:opacity-50";
export const btn = `${btnBase} border-line-strong bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink`;
export const btnPrimary = `${btnBase} border-primary bg-primary text-primary-ink hover:border-primary-hover hover:bg-primary-hover`;
export const btnDanger = `${btnBase} border-line-strong bg-surface text-bad hover:bg-surface-2`;

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
