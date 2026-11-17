import { cloneElement, isValidElement, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from "react";

// フォームの部品の見た目（色は styles.css の変数だけ）
export const input =
  "w-full rounded border border-line-strong bg-surface px-2.5 py-1.5 text-ink placeholder:text-muted disabled:bg-surface-2 disabled:text-muted";
// ボタンは 3 種類: 主（橙。作る・保存する。1 つの面に 1 つ）・ふつう（白地に枠）・消す（赤い字）
const btnBase = "inline-flex items-center justify-center rounded-full border px-4 py-1 font-semibold whitespace-nowrap disabled:opacity-50";
export const btn = `${btnBase} border-line-strong bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink`;
export const btnPrimary = `${btnBase} border-primary bg-primary text-primary-ink hover:border-primary-hover hover:bg-primary-hover`;
export const btnDanger = `${btnBase} border-line-strong bg-surface text-bad hover:bg-surface-2`;

/**
 * 補足説明の「i」ボタン。マウスを重ねる・キーボードで選ぶと出て、押すと出したままにできる（スマホは押して出す）。
 * 外を押す・Esc で閉じる
 */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const id = useId();
  const open = hover || pinned;
  useEffect(() => {
    if (!pinned) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setPinned(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPinned(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pinned]);
  return (
    <span ref={root} className="relative inline-flex align-middle" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button
        type="button"
        aria-label={`${label} の説明`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setPinned((v) => !v)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        onKeyDown={(e) => e.key === "Escape" && (setPinned(false), setHover(false))}
        className={`inline-flex size-4 items-center justify-center rounded-full border text-[10px] leading-none font-bold italic ${
          open ? "border-accent bg-accent text-surface" : "border-line-strong text-muted hover:border-accent hover:text-accent"
        }`}
      >
        i
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute top-6 left-0 z-30 block w-72 max-w-[80vw] rounded-md border border-line bg-surface px-3 py-2 text-[13px] leading-6 font-normal text-ink-2 not-italic shadow-lg [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:font-mono [&_code]:text-[12px] [&_code]:text-ink"
        >
          {children}
        </span>
      )}
    </span>
  );
}

/** ラベル付きの入力。info があればラベルの横に「i」を出す。間違いがあれば補足の代わりに出す */
export function Field({ label, hint, error, info, children }: { label: string; hint?: ReactNode; error?: string; info?: ReactNode; children: ReactNode }) {
  const id = useId();
  // 入力（1 つ）に id を付けて、ラベルと結びつける（ラベルの中に「i」のボタンを入れないため）
  const control = isValidElement(children) ? cloneElement(children as ReactElement<{ id?: string }>, { id }) : children;
  return (
    <div className="block">
      <span className="mb-1 flex items-center gap-1.5">
        <label htmlFor={id} className="text-xs font-medium text-ink-2">
          {label}
        </label>
        {info && <InfoTip label={label}>{info}</InfoTip>}
      </span>
      {control}
      {error ? <span className="mt-1 block text-xs text-bad">{error}</span> : hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </div>
  );
}

/** fieldset の見出し。info があれば「i」を出す */
export function Legend({ children, info }: { children: string; info?: ReactNode }) {
  return (
    <legend className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink-2">
      {children}
      {info && <InfoTip label={children}>{info}</InfoTip>}
    </legend>
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
