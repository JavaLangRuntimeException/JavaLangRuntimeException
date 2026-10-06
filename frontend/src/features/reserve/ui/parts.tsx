import type { ReactNode } from "react";
import { Select, SelectItem } from "@/components/base/select/select";
import { cx } from "@/utils/cx";

/** 入力欄のまとまり（見出し + 中身） */
export function FieldCard({ title, children, className }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("flex flex-col gap-3 border-t border-separator-border pt-6", className)}>
      {title && (
        <h2 className="text-[1rem] font-semibold text-text-primary">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

export function FieldError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p className="text-caption-1-regular text-text-error-primary">{children}</p>;
}

export function FieldNote({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx("text-caption-1-regular text-text-secondary", className)}>{children}</p>;
}

/** 案内の 1 行（information / warning / success / error） */
export function Notice({ tone = "information", children, className }: { tone?: "information" | "warning" | "success" | "error"; children: ReactNode; className?: string }) {
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={cx(
        "rounded-md border-s-2 bg-background-secondary-default px-4 py-3 text-[0.875rem] leading-[1.75]",
        tone === "information" && "border-accent-400 text-text-secondary",
        tone === "success" && "border-state-success-text text-text-primary",
        tone === "error" && "border-text-error-primary text-text-error-primary",
        tone === "warning" && "border-amber-400 text-text-primary",
        className,
      )}
    >
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** 数字を選ぶセレクト（下に単位の文字。旧 UnderLabelSelect） */
export function NumberSelect({
  value,
  onChange,
  options,
  underLabel,
  disabled,
  pad = true,
}: {
  value: number | null;
  onChange: (n: number) => void;
  options: number[];
  underLabel: string;
  disabled?: boolean;
  pad?: boolean;
}) {
  const label = (n: number) => (pad ? String(n).padStart(2, "0") : String(n));
  return (
    <div className="flex min-w-0 flex-1 basis-0 flex-col items-center gap-1">
      <Select
        aria-label={underLabel}
        placeholder="--"
        className="w-full"
        triggerClassName="justify-center gap-0.5 px-1.5 tabular-nums"
        popoverClassName="w-28 min-w-0"
        selectedKey={value == null ? null : String(value)}
        onSelectionChange={(k) => k != null && onChange(Number(k))}
        isDisabled={disabled}
      >
        {options.map((o) => (
          <SelectItem key={o} id={String(o)} textValue={label(o)}>
            {label(o)}
          </SelectItem>
        ))}
      </Select>
      <span className="text-caption-1-regular text-text-tertiary">{underLabel}</span>
    </div>
  );
}
