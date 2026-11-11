import { useEffect } from "react";
import { NavLink, Outlet } from "react-router";
import { useOverview } from "@/api/console";
import { isAuthError } from "@/api/errors";
import { appVersion, toEnv } from "@/lib/env";
import { navItems } from "@/lib/nav";
import { EnvBadge, EnvStripe } from "./EnvBadge";
import { QueryError } from "./QueryError";
import { Skeleton } from "./Page";

const LOGOUT_URL = "/cdn-cgi/access/logout";

export function AppShell() {
  const overview = useOverview();
  const env = toEnv(overview.data?.environment);

  // タブを並べても環境を取り違えないように、本番以外はタイトルにも付ける
  useEffect(() => {
    document.title = env && env !== "prod" ? `[${env}] taramanji cloud` : "taramanji cloud";
  }, [env]);

  return (
    <div className="flex min-h-screen flex-col">
      <EnvStripe env={env} />
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
        <NavLink to="/" className="flex items-center gap-2 font-semibold tracking-tight text-ink">
          <Logo />
          <span>taramanji cloud</span>
        </NavLink>
        {env ? <EnvBadge env={env} /> : overview.isPending && <Skeleton className="h-5 w-10" />}
        <div className="ml-auto flex min-w-0 items-center gap-4">
          {overview.data?.email && (
            <span className="hidden truncate text-ink-2 sm:inline" title="ログイン中のアカウント">
              {overview.data.email}
            </span>
          )}
          <a href={LOGOUT_URL} className="shrink-0 text-ink-2 hover:text-ink hover:underline">
            ログアウト
          </a>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav aria-label="メイン" className="shrink-0 border-b border-line bg-surface md:w-52 md:border-r md:border-b-0">
          {/* 幅が狭いときは横一列（上の階層だけ）、広いときは縦に並べて下の階層も出す */}
          <ul className="flex gap-1 overflow-x-auto px-2 py-1.5 md:flex-col md:gap-0.5 md:px-2 md:py-3">
            {navItems.map((item) => (
              <li key={item.to} className="shrink-0">
                <SideLink to={item.to} end={item.to === "/"}>
                  {item.label}
                </SideLink>
                {item.children && (
                  <ul className="mt-0.5 mb-1 ml-3 hidden border-l border-line pl-2 md:block">
                    {item.children.map((c) => (
                      <li key={c.to}>
                        <SideLink to={c.to} sub>
                          {c.label}
                        </SideLink>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          <p className="hidden px-4 pb-4 font-mono text-xs text-muted md:block" title="この画面の版">
            console {appVersion}
          </p>
        </nav>

        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">
          <div className="mx-auto max-w-6xl">
            {overview.isError && isAuthError(overview.error) ? (
              <QueryError error={overview.error} />
            ) : (
              <Outlet />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function SideLink({ to, end, sub, children }: { to: string; end?: boolean; sub?: boolean; children: string }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        [
          "block rounded px-2.5 whitespace-nowrap",
          sub ? "py-1 text-[13px]" : "py-1.5",
          isActive
            ? "bg-accent-soft font-medium text-accent"
            : sub
              ? "text-ink-2 hover:bg-surface-2 hover:text-ink"
              : "text-ink hover:bg-surface-2",
        ].join(" ")
      }
    >
      {children}
    </NavLink>
  );
}

function Logo() {
  return (
    <svg aria-hidden viewBox="0 0 32 32" className="size-5">
      <rect width="32" height="32" rx="7" className="fill-accent" />
      <path d="M9 20.5h14a4 4 0 0 0 .4-8 6 6 0 0 0-11.5-1.6A4.8 4.8 0 0 0 9 20.5Z" className="fill-surface" />
    </svg>
  );
}
