// 管理画面のパネルとお知らせ（見た目だけの部品）
import type { ReactNode } from "react";

export function AdminNotice({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <div
      role={ok ? "status" : "alert"}
      className={
        ok
          ? "rounded-2xl border border-border-button-default bg-background-primary-default px-4 py-3 text-body-2-medium break-all text-text-primary"
          : "rounded-2xl border border-border-error-default bg-background-primary-default px-4 py-3 text-body-2-medium break-all text-text-error-primary"
      }
    >
      <span className="me-2 inline-block size-2 rounded-full align-middle" style={{ background: ok ? "var(--color-accent-500)" : "currentColor" }} aria-hidden="true" />
      {children}
    </div>
  );
}

/** 管理画面のパネル（白い面） */
export function AdminPanel({ title, actions, children }: { title?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-border-button-default bg-background-primary-default p-5 sm:p-6">
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="text-headline-semibold text-text-primary">{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
