import { NavLink, Link } from "react-router";
import { useAtomValue } from "jotai";
import { navLockedAtom } from "@/shared/model/nav-lock";
import { cx } from "@/utils/cx";
import { HeaderMarquee } from "./HeaderMarquee";

// 選択中のページの色（旧サイトと同じ色相: Links 青・WorkSpot 橙・Contact 緑・Ask Me 紫）。ナビの識別色はトークンの例外（CLAUDE.md）
const NAV = [
  { to: "/link", label: "Links", active: "bg-blue-600 shadow-blue-500/30" },
  { to: "/location", label: "WorkSpot", active: "bg-orange-700 shadow-orange-700/30" },
  { to: "/contact", label: "Contact", active: "bg-emerald-700 shadow-emerald-700/30" },
  { to: "/reserve", label: "Ask Me", active: "bg-violet-600 shadow-violet-500/30" },
] as const;

const PEEK = "pointer-events-none absolute top-1/2 z-10 -translate-y-1/2 opacity-0 transition-transform duration-300 ease-out motion-reduce:transition-none";

export function SiteHeader() {
  const locked = useAtomValue(navLockedAtom);
  return (
    <header className="sticky top-0 z-50 w-full overflow-x-clip border-b border-separator-border bg-background-full/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-3 sm:gap-4 sm:px-4">
        <Link to="/" className="text-headline-semibold whitespace-nowrap text-text-primary transition-transform active:scale-[.97]">
          taramanji
        </Link>
        <div className="hidden min-w-0 flex-1 overflow-hidden sm:block">
          <HeaderMarquee />
        </div>
        <nav aria-label="メイン" className="flex min-w-0 items-center gap-0.5 whitespace-nowrap sm:gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              aria-disabled={locked}
              tabIndex={locked ? -1 : undefined}
              className={({ isActive }) =>
                cx(
                  "group relative overflow-hidden rounded-lg px-2 py-2 text-body-2-medium outline-none transition-all duration-200 sm:px-3 sm:text-body-medium",
                  "focus-visible:ring-2 focus-visible:ring-border-focus-ring active:scale-[.97]",
                  isActive ? cx("text-text-white shadow-lg", item.active) : "text-text-secondary hover:bg-background-secondary-hover hover:text-text-primary",
                  locked && "pointer-events-none opacity-50",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className="relative z-20">{item.label}</span>
                  {/* 旧サイトと同じ: 選択中は右から Qiitan、それ以外は左から Gopher が顔を出す */}
                  {isActive ? (
                    <span
                      aria-hidden="true"
                      className={cx(PEEK, "end-0 translate-x-full group-hover:translate-x-1/2 group-hover:opacity-100 group-active:translate-x-1/2 group-active:opacity-100")}
                    >
                      <img src="/qiitan.png" alt="" width={30} height={30} className="size-[30px] -rotate-45" />
                    </span>
                  ) : (
                    <span
                      aria-hidden="true"
                      className={cx(PEEK, "start-0 -translate-x-full group-hover:-translate-x-1/2 group-hover:opacity-100 group-active:-translate-x-1/2 group-active:opacity-100")}
                    >
                      <img src="/gopher.png" alt="" width={30} height={30} className="size-[30px] rotate-45" />
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="h-8 overflow-hidden border-t border-separator-border sm:hidden">
        <div className="flex h-full items-center">
          <HeaderMarquee />
        </div>
      </div>
    </header>
  );
}
