import type { ReactNode } from "react";
import { RiCheckboxCircleLine, RiErrorWarningLine, RiInformationLine, type RemixiconComponentType } from "@remixicon/react";
import { Select, SelectItem } from "@/components/base/select/select";
import { Card } from "@/shared/ui/layout";
import { cx } from "@/utils/cx";

type Icon = RemixiconComponentType;

/** 入力欄のまとまり（見出し + 中身） */
export function FieldCard({ title, icon: IconCmp, children, className }: { title?: ReactNode; icon?: Icon; children: ReactNode; className?: string }) {
  return (
    <Card className={cx("flex flex-col gap-3", className)}>
      {title && (
        <h2 className="inline-flex items-center gap-2 text-body-semibold text-text-primary">
          {IconCmp && <IconCmp className="size-4 text-foreground-icon-secondary" aria-hidden />}
          {title}
        </h2>
      )}
      {children}
    </Card>
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
  const IconCmp = tone === "success" ? RiCheckboxCircleLine : tone === "information" ? RiInformationLine : RiErrorWarningLine;
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={cx(
        "flex items-start gap-2.5 rounded-2xl px-4 py-3 text-body-2-regular",
        tone === "information" && "bg-notification-information-background text-notification-information-foreground",
        tone === "success" && "bg-notification-success-background text-notification-success-foreground",
        tone === "error" && "bg-notification-error-background text-notification-error-foreground",
        tone === "warning" && "bg-status-yellow-background text-text-primary",
        className,
      )}
    >
      <IconCmp className="mt-0.5 size-4 shrink-0" aria-hidden />
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
