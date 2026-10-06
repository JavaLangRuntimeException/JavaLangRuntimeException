import type { ElementType, ReactNode } from "react";
import { cx } from "@/utils/cx";

// サイト全体の見た目の基本。白〜ニュートラルの面 + アクセント 1 色、余白と文字の階層で見せる（装飾・グラデーションは使わない）

export function PageContainer({ children, className, width = "default" }: { children: ReactNode; className?: string; width?: "default" | "narrow" | "wide" }) {
  return (
    <main
      className={cx(
        "mx-auto w-full px-4 pb-20 pt-10 sm:px-6",
        width === "narrow" && "max-w-3xl",
        width === "default" && "max-w-5xl",
        width === "wide" && "max-w-6xl",
        className,
      )}
    >
      {children}
    </main>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-10 flex flex-col gap-4 border-b border-separator-border pb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-2">
        {eyebrow && <p className="text-caption-1-semibold uppercase tracking-wider text-accent-600">{eyebrow}</p>}
        <h1 className="text-title-1-semibold text-text-primary">{title}</h1>
        {description && <div className="max-w-2xl text-body-regular text-text-secondary">{description}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Section({ title, description, actions, children, className, id }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cx("flex flex-col gap-5 py-8", className)}>
      {(title || actions) && (
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            {title && <h2 className="text-title-3-semibold text-text-primary">{title}</h2>}
            {description && <p className="text-body-2-regular text-text-secondary">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Card<T extends ElementType = "div">({ as, children, className, interactive, ...rest }: { as?: T; children: ReactNode; className?: string; interactive?: boolean } & Omit<React.ComponentPropsWithoutRef<T>, "as" | "children" | "className">) {
  const Comp = (as ?? "div") as ElementType;
  return (
    <Comp
      className={cx(
        "rounded-3xl border border-border-button-default bg-background-primary-default p-5",
        interactive && "lift hover:bg-background-primary-hover outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
        className,
      )}
      {...rest}
    >
      {children}
    </Comp>
  );
}

/** 読み込み中のプレースホルダー（点滅しない静かな面） */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx("animate-pulse rounded-xl bg-background-secondary-default motion-reduce:animate-none", className)} />;
}
