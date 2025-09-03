"use client";

import Link from "next/link";
import { affiliations } from "../model";

export function AffiliationBadges() {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">所属</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {affiliations.map((a) => (
          <Link key={a.label} href={a.href} target="_blank" className="no-underline">
            <span className={"inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-white/20 " + a.color}>
              {a.label}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}


