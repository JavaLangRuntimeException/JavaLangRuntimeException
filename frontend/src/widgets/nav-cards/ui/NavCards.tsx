import type { ReactNode } from "react";
import { Link } from "react-router";
import { DecodeReveal } from "@/shared/ui/motion";

export interface NavCardItem {
  href: string;
  title: string;
  description: ReactNode;
}

/** 主要ページへの入口（線で区切った 2 列。画面に入ると文字が記号から順に定まり、ホバーで面が浮き、題名がアクセント色に） */
export function NavCards({ items }: { items: NavCardItem[] }) {
  return (
    <DecodeReveal>
      <nav aria-label="ページ" className="grid border-y border-separator-border sm:grid-cols-2">
        {items.map((item, i) => (
          <Link
            key={item.href}
            to={item.href}
            className={[
              "group flex flex-col gap-1.5 px-1 py-6 outline-none sm:px-6",
              "border-separator-border transition-colors hover:bg-background-primary-default focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus-ring",
              i > 0 ? "border-t sm:border-t-0" : "",
              i >= 2 ? "sm:border-t" : "",
              i % 2 === 1 ? "sm:border-s" : "",
            ].join(" ")}
          >
            <span className="text-[1.25rem] font-semibold tracking-[-0.005em] text-text-primary transition-colors group-hover:text-accent-300">
              {item.title}
            </span>
            <span className="text-[0.9375rem] leading-[1.75] text-text-secondary">{item.description}</span>
          </Link>
        ))}
      </nav>
    </DecodeReveal>
  );
}
