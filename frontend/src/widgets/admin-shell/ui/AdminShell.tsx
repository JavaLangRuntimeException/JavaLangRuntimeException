import type { ReactNode } from "react";
import { Button } from "@/components/base/buttons/button";
import { signOutAndGo } from "@/entities/session";

/** 管理画面の枠（上部バー: タイトル・もう一方の管理画面へのリンク・ログイン中のアカウント・ログアウト） */
export function AdminShell({
  title,
  email,
  crossLink,
  crossLinkPosition = "end",
  width = "wide",
  children,
}: {
  title: string;
  email: string;
  crossLink: { href: string; label: string };
  crossLinkPosition?: "start" | "end";
  width?: "default" | "wide";
  children: ReactNode;
}) {
  const link = (
    <a
      href={crossLink.href}
      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-body-2-medium text-text-secondary outline-none transition-colors hover:bg-background-secondary-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
    >
      {crossLink.label.replace(/ →$/, "")}
      </a>
  );
  const max = width === "wide" ? "max-w-6xl" : "max-w-5xl";
  return (
    <div className="min-h-dvh bg-background-secondary-default">
      <header className="sticky top-0 z-40 border-b border-separator-border bg-background-primary-default">
        <div className={`mx-auto flex ${max} flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6`}>
          <div className="flex items-center gap-3">
            {crossLinkPosition === "start" && link}
            <h1 className="text-headline-semibold text-text-primary">{title}</h1>
          </div>
          <div className="flex items-center gap-3">
            {crossLinkPosition === "end" && link}
            <span className="hidden text-body-2-regular text-text-secondary sm:inline">{email}</span>
            <Button variant="secondary" size="small" onClick={() => signOutAndGo("/")}>
              ログアウト
            </Button>
          </div>
        </div>
      </header>
      <div className={`mx-auto ${max} px-4 py-6 sm:px-6`}>{children}</div>
    </div>
  );
}

/** 管理画面の読み込み中・リダイレクト前 */
export function AdminLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background-secondary-default">
      <p className="text-body-regular text-text-secondary">読み込み中...</p>
    </div>
  );
}

/** 操作結果のお知らせ（成功 / 失敗） */
