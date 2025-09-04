"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "../shared/lib/cn";

export function Header() {
  const pathname = usePathname();

  const isActive = (href: string) => pathname === href;

  return (
    <header className="sticky top-0 z-50 w-full backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:supports-[backdrop-filter]:bg-zinc-900/60 border-b border-zinc-200/60 dark:border-zinc-800/60">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="font-semibold tracking-tight whitespace-nowrap">
          taramanji
        </Link>
        <div className="mx-4 flex-1 overflow-hidden hidden sm:block">
          <div className="marquee whitespace-nowrap text-xs text-zinc-600 dark:text-zinc-300">
            Links/Contactでプロフィール・SNS・連絡先を確認できます。Reserveでお打ち合わせ予約ができます。
          </div>
        </div>
        <nav className="flex items-center gap-2 whitespace-nowrap">
          <Link
            href="/"
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              isActive("/")
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            )}
          >
            Home
          </Link>
          <Link
            href="/link"
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              isActive("/link")
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            )}
          >
            Links/Contact
          </Link>
          <Link
            href="/reserve"
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              isActive("/reserve")
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            )}
          >
            Reserve
          </Link>
        </nav>
      </div>
    </header>
  );
}


