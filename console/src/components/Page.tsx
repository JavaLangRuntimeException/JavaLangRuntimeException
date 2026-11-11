import type { ReactNode } from "react";

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-[75ch] text-ink-2">{description}</p>}
      </div>
      {actions}
    </header>
  );
}

/** 見出し付きの面（AWS のコンソールの「コンテナ」）。見出しは h2、右上に操作や補足を置ける */
export function Panel({
  title,
  aside,
  children,
  className = "",
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`overflow-hidden rounded-xl border border-line bg-surface shadow-[0_1px_1px_rgb(0_0_0/0.04)] ${className}`}>
      {title && (
        <div className="flex min-h-12 items-center justify-between gap-4 border-b border-line px-5 py-2.5">
          <h2 className="text-base font-bold text-ink">{title}</h2>
          {aside && <div className="text-[13px] text-muted">{aside}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** まだない・まだ空のときの案内。何ができるようになるか、次に何をするかを書く */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-6 py-10 text-center">
      <p className="font-semibold text-ink">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-[60ch] text-ink-2">{children}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`block animate-pulse rounded bg-surface-2 ${className}`} />;
}

export function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[13px]">{children}</span>;
}
