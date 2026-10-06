import { useState } from "react";
import { RiBuilding2Line, RiExternalLinkLine } from "@remixicon/react";
import { affiliations, type AffiliationCategory } from "@/entities/affiliation";
import { ButtonLink } from "@/components/base/buttons/button";
import { Dialog } from "@/shared/ui/dialog";
import { Section } from "@/shared/ui/layout";
import { cx } from "@/utils/cx";

const categoryOrder: AffiliationCategory[] = [
  "university_research",
  "community",
  "engineer",
  "photographer",
  "community_director",
  "event_management",
  "conference_staff",
  "technical_mentor",
];

const categoryLabels: Record<AffiliationCategory, string> = {
  university_research: "University & Research",
  community: "Community",
  engineer: "Engineer",
  photographer: "Photographer",
  community_director: "Community Director/Organizer",
  event_management: "Event Management",
  conference_staff: "Conference Staff",
  technical_mentor: "Technical Mentor",
};

/** 所属。タグを押すと説明と公式サイトへのリンクを出す */
export function AffiliationBadges() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const open = openIndex === null ? null : affiliations[openIndex];

  return (
    <Section
      id="affiliation"
      title={
        <span className="inline-flex items-center gap-2">
          <RiBuilding2Line className="size-5 text-foreground-icon-secondary" aria-hidden />
          Affiliation
        </span>
      }
    >
      <div className="flex flex-col gap-5">
        {categoryOrder.map((cat) => {
          const items = affiliations.filter((a) => a.category === cat);
          if (items.length === 0) return null;
          return (
            <div key={cat} className="grid gap-2 sm:grid-cols-[13rem_1fr] sm:gap-4">
              <h3 className="text-body-2-medium text-text-tertiary sm:pt-1.5">{categoryLabels[cat]}</h3>
              <ul className="flex flex-wrap gap-2">
                {items.map((a) => (
                  <li key={a.label}>
                    <button
                      type="button"
                      onClick={() => setOpenIndex(affiliations.indexOf(a))}
                      className={cx(
                        // 所属ごとの色（旧サイトと同じ。データの識別色はトークンの例外）
                        "lift rounded-full px-3 py-1.5 text-start text-body-2-medium text-text-white shadow-sm ring-1 ring-white/15 outline-none hover:ring-white/40 focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                        a.color,
                      )}
                    >
                      {a.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <Dialog
        isOpen={open !== null}
        onOpenChange={(v) => !v && setOpenIndex(null)}
        title={
          open && (
            <span className="flex flex-col gap-1">
              <span>{open.label}</span>
              <span className="text-caption-1-medium text-text-tertiary">{categoryLabels[open.category]}</span>
              <span className={cx("mt-2 block h-[3px] w-full rounded-full", open.color)} aria-hidden />
            </span>
          )
        }
        footer={
          open?.href && (
            <ButtonLink href={open.href} target="_blank" rel="noopener noreferrer" variant="secondary" trailingIcon={RiExternalLinkLine}>
              公式サイトを見る
            </ButtonLink>
          )
        }
      >
        {open?.description && <p className="text-body-regular text-text-secondary">{open.description}</p>}
      </Dialog>
    </Section>
  );
}
