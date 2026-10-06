import { useState } from "react";
import { skills } from "@/entities/skill";
import { Dialog } from "@/shared/ui/dialog";
import { Section } from "@/shared/ui/layout";
import { cx } from "@/utils/cx";

/** スキル。押すと説明と関連キーワード（Google 検索へのリンク）を出す */
export function SkillBadges() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const open = openIndex === null ? null : skills[openIndex];

  return (
    <Section
      id="skills"
      title="Skill Set"
    >
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {skills.map((s, idx) => (
          <li key={s.title}>
            <button
              type="button"
              onClick={() => setOpenIndex(idx)}
              className="lift group relative flex h-full w-full flex-col gap-1 overflow-hidden rounded-lg border border-separator-border bg-background-primary-default px-4 py-3.5 ps-5 hover:border-border-button-hover text-start outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
            >
              {/* スキルごとの色（旧サイトのタグの色）。左の帯と、ホバーでにじむ色 */}
              <span className={cx("absolute inset-y-0 start-0 w-1", s.color)} aria-hidden />
              <span className={cx("pointer-events-none absolute -end-10 -top-10 size-28 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-40", s.color)} aria-hidden />
              <span className="relative text-body-semibold text-text-primary">{s.title}</span>
              <span className="relative line-clamp-2 text-caption-1-regular text-text-secondary">{s.short}</span>
            </button>
          </li>
        ))}
      </ul>

      <Dialog
        isOpen={open !== null}
        onOpenChange={(v) => !v && setOpenIndex(null)}
        title={
          open && (
            <span className="flex flex-col gap-1">
              <span>{open.title}</span>
              <span className="text-body-2-regular text-text-secondary">{open.short}</span>
              <span className={cx("mt-2 block h-[3px] w-full rounded-full", open.color)} aria-hidden />
            </span>
          )
        }
      >
        {open && (
          <div className="flex flex-col gap-4">
            <p className="text-body-regular text-text-secondary">{open.description}</p>
            {open.tags.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {open.tags.map((t) => (
                  <li key={t}>
                    <a
                      href={`https://www.google.com/search?q=${encodeURIComponent(t)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="press inline-flex rounded-md bg-background-secondary-default px-2 py-1 text-caption-1-medium text-text-secondary outline-none hover:bg-background-secondary-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                    >
                      {t}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Dialog>
    </Section>
  );
}
