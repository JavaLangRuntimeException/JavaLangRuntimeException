"use client";

import Link from "next/link";
import { affiliations } from "../model";

export function AffiliationBadges() {
  const categoryOrder = [
    "大学・研究室",
    "コミュニティ",
    "エンジニア",
    "コミュニティ運営",
    "イベント運営",
    "技術メンター",
  ] as const;

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">所属</h2>
      {categoryOrder.map((cat) => {
        const items = affiliations.filter((a) => a.category === cat);
        if (items.length === 0) return null;
        return (
          <div key={cat} className="mt-4">
            <h3 className="text-sm font-medium text-zinc-300">{cat}</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {items.map((a) => (
                <Link key={a.label} href={a.href} target="_blank" rel="noreferrer" className="no-underline">
                  <span className={"inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-white/20 text-white " + a.color}>
                    {a.label}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
