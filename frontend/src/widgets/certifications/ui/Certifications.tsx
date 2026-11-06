import { certifications, CREDLY_PROFILE_URL } from "@/entities/certification";
import { useT } from "@/shared/lib/i18n";
import { Section } from "@/shared/ui/layout";
import { cx } from "@/utils/cx";

/** 取得した資格。先頭に Credly のプロフィール、カードは各資格の公式の説明ページへ */
export function Certifications() {
  const t = useT();
  return (
    <Section id="certifications" title="Certification">
      <p className="text-body-2-regular text-text-secondary">
        {t({ ja: "取得したバッジは Credly で確認できます: ", en: "My badges are verified on Credly: " })}
        <a
          href={CREDLY_PROFILE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all font-mono text-text-primary underline decoration-separator-border underline-offset-[6px] outline-none transition-colors hover:decoration-accent-400 focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          {CREDLY_PROFILE_URL}
        </a>
      </p>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {certifications.map((c) => (
          <li key={c.href}>
            <a
              href={c.href}
              target="_blank"
              rel="noopener noreferrer"
              className="lift relative flex h-full w-full flex-col gap-1 overflow-hidden rounded-lg border border-separator-border bg-background-primary-default px-4 py-3.5 ps-5 outline-none hover:border-border-button-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring"
            >
              <span className={cx("absolute inset-y-0 start-0 w-1", c.color)} aria-hidden />
              <span className="text-body-semibold text-text-primary">{t(c.name)}</span>
              <span className="meta text-caption-1-regular text-text-tertiary">{t(c.issuer)}</span>
              {c.achieved && <span className="meta text-caption-1-regular text-text-secondary">{t(c.achieved)}</span>}
              <span className="mt-1 text-caption-1-regular text-text-secondary">{t(c.description)}</span>
            </a>
          </li>
        ))}
      </ul>
    </Section>
  );
}
