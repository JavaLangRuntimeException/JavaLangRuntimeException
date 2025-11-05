"use client";

import Link from "next/link";
import { affiliations } from "../model";

export function AffiliationBadges() {
  const categoryOrder = [
    "university_research",
    "community",
    "engineer",
    "community_event_management",
    "conference_staff",
    "technical_mentor",
  ] as const;

  const categoryLabels: Record<string, string> = {
    "university_research": "University & Research",
    "community": "Community",
    "engineer": "Engineer",
    "community_event_management": "Community & Event Management",
    "conference_staff": "Conference Staff",
    "technical_mentor": "Technical Mentor",
  };

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">Affiliation</h2>
      {categoryOrder.map((cat) => {
        const items = affiliations.filter((a) => a.category === cat);
        if (items.length === 0) return null;
        return (
          <div key={cat} className="mt-4">
            <h3 className="text-sm font-medium text-zinc-300">{categoryLabels[cat]}</h3>
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
