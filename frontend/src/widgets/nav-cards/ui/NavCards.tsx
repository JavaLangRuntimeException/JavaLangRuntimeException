import type { ReactNode } from "react";
import type { RemixiconComponentType } from "@remixicon/react";
import { Link } from "react-router";
import { RiArrowRightLine } from "@remixicon/react";

export interface NavCardItem {
  href: string;
  title: string;
  icon: RemixiconComponentType;
  description: ReactNode;
}

/** 主要ページへの入口 */
export function NavCards({ items }: { items: NavCardItem[] }) {
  return (
    <nav aria-label="ページ" className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <Link
          key={item.href}
          to={item.href}
          className="group flex items-start gap-4 rounded-3xl border border-border-button-default bg-background-primary-default p-5 outline-none lift hover:bg-background-primary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-background-secondary-default text-accent-600">
            <item.icon className="size-5" aria-hidden />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex items-center justify-between gap-2 text-headline-semibold text-text-primary">
              {item.title}
              <RiArrowRightLine
                className="size-4 text-foreground-icon-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-accent-600 motion-reduce:transition-none"
                aria-hidden
              />
            </span>
            <span className="text-body-2-regular text-text-secondary">{item.description}</span>
          </span>
        </Link>
      ))}
    </nav>
  );
}
