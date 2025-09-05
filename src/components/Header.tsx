"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "../shared/lib/cn";
import Image from "next/image";

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
          <HeaderMarquee />
        </div>
        <nav className="flex items-center gap-2 whitespace-nowrap">
          <Link
            href="/"
            className={cn(
              "relative group overflow-hidden rounded-md px-3 py-1.5 text-sm transition-colors",
              isActive("/")
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            )}
          >
            <span className="relative z-20">Home</span>
            {isActive("/") ? (
              <span className="pointer-events-none absolute top-1/2 right-0 -translate-y-1/2 translate-x-full opacity-0 transition-transform duration-300 ease-out md:group-hover:translate-x-1/2 md:group-hover:opacity-100 group-active:translate-x-1/2 group-active:opacity-100 z-10" aria-hidden="true">
                <Image src="/gopher.png" alt="Gopher" width={30} height={30} className="h-[30px] w-[30px] -rotate-45" />
              </span>
            ) : (
              <span className="pointer-events-none absolute top-1/2 left-0 -translate-y-1/2 -translate-x-full opacity-0 transition-transform duration-300 ease-out md:group-hover:-translate-x-1/2 md:group-hover:opacity-100 group-active:-translate-x-1/2 group-active:opacity-100 z-10" aria-hidden="true">
                <Image src="/qiitan.png" alt="Qiitan" width={30} height={30} className="h-[30px] w-[30px] rotate-45" />
              </span>
            )}
          </Link>
          <Link
            href="/link"
            className={cn(
              "relative group overflow-hidden rounded-md px-3 py-1.5 text-sm transition-colors",
              isActive("/link")
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            )}
          >
            <span className="relative z-20">Links/Contact</span>
            {isActive("/link") ? (
              <span className="pointer-events-none absolute top-1/2 right-0 -translate-y-1/2 translate-x-full opacity-0 transition-transform duration-300 ease-out md:group-hover:translate-x-1/2 md:group-hover:opacity-100 group-active:translate-x-1/2 group-active:opacity-100 z-10" aria-hidden="true">
                <Image src="/gopher.png" alt="Gopher" width={30} height={30} className="h-[30px] w-[30px] -rotate-45" />
              </span>
            ) : (
              <span className="pointer-events-none absolute top-1/2 left-0 -translate-y-1/2 -translate-x-full opacity-0 transition-transform duration-300 ease-out md:group-hover:-translate-x-1/2 md:group-hover:opacity-100 group-active:-translate-x-1/2 group-active:opacity-100 z-10" aria-hidden="true">
                <Image src="/qiitan.png" alt="Qiitan" width={30} height={30} className="h-[30px] w-[30px] rotate-45" />
              </span>
            )}
          </Link>
          <Link
            href="/reserve"
            className={cn(
              "relative group overflow-hidden rounded-md px-3 py-1.5 text-sm transition-colors",
              isActive("/reserve")
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            )}
          >
            <span className="relative z-20">Reserve</span>
            {isActive("/reserve") ? (
              <span className="pointer-events-none absolute top-1/2 right-0 -translate-y-1/2 translate-x-full opacity-0 transition-transform duration-300 ease-out md:group-hover:translate-x-1/2 md:group-hover:opacity-100 group-active:translate-x-1/2 group-active:opacity-100 z-10" aria-hidden="true">
                <Image src="/gopher.png" alt="Gopher" width={30} height={30} className="h-[30px] w-[30px] -rotate-45" />
              </span>
            ) : (
              <span className="pointer-events-none absolute top-1/2 left-0 -translate-y-1/2 -translate-x-full opacity-0 transition-transform duration-300 ease-out md:group-hover:-translate-x-1/2 md:group-hover:opacity-100 group-active:-translate-x-1/2 group-active:opacity-100 z-10" aria-hidden="true">
                <Image src="/qiitan.png" alt="Qiitan" width={30} height={30} className="h-[30px] w-[30px] rotate-45" />
              </span>
            )}
          </Link>
        </nav>
      </div>
    </header>
  );
}

function HeaderMarquee() {
  const [slots, setSlots] = React.useState<string[]>([]);
  React.useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/ical/busy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ weekStartISO: getMonday(new Date()).toISOString() }) });
        const data = await res.json().catch(() => ({ busy: [] }));
        const busy: { start: string; end: string }[] = data?.busy || [];
        const suggestions = computeNextFiveSlots(busy);
        if (active) setSlots(suggestions);
      } catch {
        if (active) setSlots([]);
      }
    })();
    return () => { active = false; };
  }, []);

  const text = slots.length > 0
    ? `直近相談予約可能時間: ${slots.join(" / ")}`
    : "直近相談予約可能時間: 取得中…";

  const message = `${text} | Links/Contact ではプロフィール・SNS・連絡先を掲載中。Reserve では面談予約が可能です。面談の変更・取消は EventID を添えてお問い合わせください。`;

  return (
    <div className="relative overflow-hidden">
      <div className="marquee-track text-xs text-zinc-600 dark:text-zinc-300">
        <span className="marquee-item">{message}</span>
        <span className="marquee-item" aria-hidden="true">{message}</span>
      </div>
      <style jsx>{`
        .marquee-track {
          display: inline-flex;
          white-space: nowrap;
          will-change: transform;
          animation: marquee 60s linear infinite;
          padding-left: 50%;
        }
        .marquee-item { padding-right: 3rem; }
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function weekdayName(d: Date) {
  return ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
}

function getMonday(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function isOverlappingBusy(start: Date, end: Date, busy: { start: string; end: string }[]): boolean {
  const s = start.getTime();
  const e = end.getTime();
  return busy.some((b) => {
    const bs = new Date(b.start).getTime();
    const be = new Date(b.end).getTime();
    return Math.max(s, bs) < Math.min(e, be);
  });
}

function computeNextFiveSlots(busy: { start: string; end: string }[]): string[] {
  const results: string[] = [];
  const now = new Date();
  const step = 30 * 60 * 1000;
  const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0, 0, 0);
  const dayEnd = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 24, 0, 0, 0);
  const withinBusiness = (d: Date) => d.getHours() > 8 && d.getHours() < 24;

  // Start from now + 2h aligned to the next :00 or :30, but not before 9:00
  const startCandidate = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const mins = startCandidate.getMinutes();
  if (mins > 0 && mins <= 30) startCandidate.setMinutes(30, 0, 0);
  else if (mins > 30) { startCandidate.setHours(startCandidate.getHours() + 1, 0, 0, 0); } else { startCandidate.setSeconds(0, 0); }
  let t = new Date(Math.max(startCandidate.getTime(), dayStart(now).getTime()));
  if (t >= dayEnd(t)) {
    const nextDay = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1);
    t = dayStart(nextDay);
  }

  let guard = 0; // avoid infinite loop
  const maxChecks = 400; // ~200 hours window
  while (results.length < 5 && guard < maxChecks) {
    const end = new Date(t.getTime() + step);
    if (end > dayEnd(t)) {
      const nextDay = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1);
      t = dayStart(nextDay);
      guard += 1;
      continue;
    }
    if (withinBusiness(t) && withinBusiness(end) && !isOverlappingBusy(t, end, busy)) {
      results.push(`${t.getMonth() + 1}/${pad(t.getDate())}(${weekdayName(t)}) ${pad(t.getHours())}:${pad(t.getMinutes())}〜`);
    }
    t = end;
    guard += 1;
  }
  return results;
}


