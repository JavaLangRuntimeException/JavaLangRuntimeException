import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { useOverview } from "@/api/console";
import { isAuthError } from "@/api/errors";
import { appVersion, envLabel, toEnv, type Env } from "@/lib/env";
import { filterGroups, home, serviceGroups, serviceOf } from "@/lib/nav";
import { EnvStripe } from "./EnvBadge";
import { QueryError } from "./QueryError";
import { ServiceIcon } from "./ServiceIcon";

const LOGOUT_URL = "/cdn-cgi/access/logout";

// 画面の骨組み。AWS のコンソールにならって、暗い色の上の帯（ロゴ・サービスのメニュー・環境・アカウント）、
// 左にサービスの一覧、右に中身（パンくず → 見出し → 中身）を置く
export function AppShell() {
  const overview = useOverview();
  const env = toEnv(overview.data?.environment);
  const { pathname } = useLocation();
  const current = serviceOf(pathname);

  // タブを並べても環境を取り違えないように、本番以外はタイトルにも付ける
  useEffect(() => {
    const page = current ? `${current.label} | ` : "";
    document.title = `${env && env !== "prod" ? `[${env}] ` : ""}${page}taramanji cloud`;
  }, [env, current]);

  return (
    <div className="flex min-h-screen flex-col">
      <EnvStripe env={env} />
      <TopBar env={env} email={overview.data?.email} />

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <SideNav />
        <main className="min-w-0 flex-1 px-4 pt-3 pb-10 md:px-8">
          <div className="mx-auto max-w-6xl">
            <nav aria-label="パンくず" className="mb-3 flex items-center gap-2 text-[13px] text-muted">
              {current ? (
                <>
                  <Link to="/" className="text-accent hover:underline">
                    taramanji cloud
                  </Link>
                  <span aria-hidden>›</span>
                  <span className="text-ink-2">{current.label}</span>
                </>
              ) : (
                <span className="text-ink-2">taramanji cloud</span>
              )}
            </nav>
            {overview.isError && isAuthError(overview.error) ? <QueryError error={overview.error} /> : <Outlet />}
          </div>
        </main>
      </div>
    </div>
  );
}

// 環境は AWS のリージョンの位置に出す。本番以外は色を付けて、取り違えないようにする
const envPill: Record<Env, string> = {
  prod: "border border-nav-line text-nav-ink",
  stg: "bg-env-stg text-env-stg-ink font-semibold",
  dev: "bg-env-dev text-env-dev-ink font-semibold",
};

function TopBar({ env, email }: { env: Env | undefined; email: string | undefined }) {
  return (
    <header className="relative z-20 flex h-11 shrink-0 items-center gap-1 bg-nav px-3 text-nav-ink">
      <Link to="/" className="flex items-center gap-2 rounded px-1.5 py-1 font-semibold tracking-tight hover:bg-nav-hover">
        <Logo />
        <span className="hidden sm:inline">taramanji cloud</span>
      </Link>
      <ServicesMenu />
      <div className="ml-auto flex min-w-0 items-center gap-3">
        {env && (
          <span className={`inline-flex h-6 items-center rounded px-2 text-xs ${envPill[env]}`} title={`環境: ${env}`}>
            {envLabel[env]}
          </span>
        )}
        {email && (
          <span className="hidden truncate text-[13px] text-nav-muted md:inline" title="ログイン中のアカウント">
            {email}
          </span>
        )}
        <a href={LOGOUT_URL} className="shrink-0 rounded px-2 py-1 text-[13px] hover:bg-nav-hover">
          ログアウト
        </a>
      </div>
    </header>
  );
}

/** 「サービス」: 全部のサービスを分類ごとに並べ、名前で絞り込める */
function ServicesMenu() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();

  // 移動したら閉じる
  useEffect(() => setOpen(false), [pathname]);
  // 外を押す・Esc で閉じる
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const groups = filterGroups(query);
  return (
    <div ref={root}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="services-menu"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 rounded px-2.5 py-1 text-[13px] font-medium hover:bg-nav-hover ${open ? "bg-nav-hover" : ""}`}
      >
        <GridIcon />
        サービス
      </button>
      {open && (
        <div id="services-menu" className="absolute top-11 right-0 left-0 max-h-[80vh] overflow-y-auto border-b border-line bg-surface text-ink shadow-lg md:right-auto md:left-3 md:w-[720px] md:rounded-b-md md:border-x">
          <div className="border-b border-line p-3">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="サービスを探す"
              aria-label="サービスを探す"
              // メニューを開いたら、すぐ打てるようにする
              // oxlint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              className="w-full rounded border border-line-strong bg-surface px-2.5 py-1.5 placeholder:text-muted"
            />
          </div>
          {groups.length === 0 ? (
            <p className="p-4 text-ink-2">「{query}」に当たるサービスはありません。</p>
          ) : (
            <div className="grid gap-x-6 gap-y-4 p-4 sm:grid-cols-2">
              {groups.map((g) => (
                <section key={g.label}>
                  <h2 className="mb-1 text-xs font-semibold text-muted">{g.label}</h2>
                  <ul>
                    {g.services.map((s) => (
                      <li key={s.id}>
                        <Link to={s.to} className="flex items-center gap-3 rounded px-2 py-1.5 hover:bg-surface-2">
                          <ServiceIcon id={s.id} size={28} />
                          <span className="min-w-0">
                            <span className="block font-medium text-accent">{s.label}</span>
                            <span className="block truncate text-xs text-muted">{s.description}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SideNav() {
  return (
    <nav aria-label="サービス" className="shrink-0 border-b border-line bg-surface md:w-56 md:border-r md:border-b-0">
      {/* 幅が狭いときは横一列、広いときは分類ごとに縦に並べる */}
      <div className="flex gap-1 overflow-x-auto px-2 py-1.5 md:block md:px-0 md:py-3">
        <SideLink to={home.to} end>
          <ServiceIcon id="home" size={18} />
          {home.label}
        </SideLink>
        {serviceGroups.map((g) => (
          <div key={g.label} className="flex gap-1 md:mt-3 md:block">
            <p className="hidden px-4 pb-1 text-[11px] font-semibold tracking-wide text-muted md:block">{g.label}</p>
            {g.services.map((s) => (
              <SideLink key={s.id} to={s.to}>
                <ServiceIcon id={s.id} size={18} />
                {s.label}
              </SideLink>
            ))}
          </div>
        ))}
      </div>
      <p className="hidden px-4 pb-4 font-mono text-xs text-muted md:block" title="この画面の版">
        console {appVersion}
      </p>
    </nav>
  );
}

function SideLink({ to, end, children }: { to: string; end?: boolean; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        [
          "flex shrink-0 items-center gap-2.5 rounded px-2.5 py-1.5 whitespace-nowrap md:rounded-none md:border-l-[3px] md:px-4",
          isActive ? "bg-accent-soft font-semibold text-accent md:border-accent" : "text-ink hover:bg-surface-2 md:border-transparent",
        ].join(" ")
      }
    >
      {children}
    </NavLink>
  );
}

/** ロゴ: 雲を、線の太さをそろえた 1 本の線で描く */
function Logo() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-6">
      <path d="M7 18h10.5a3.5 3.5 0 0 0 .3-7 5.5 5.5 0 0 0-10.6-1.3A4.2 4.2 0 0 0 7 18Z" fill="none" stroke="var(--nav-accent)" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-4" fill="currentColor">
      {[1, 6.5, 12].flatMap((y) => [1, 6.5, 12].map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="3" height="3" />))}
    </svg>
  );
}
