import { certifications, CREDLY_PROFILE_URL } from "@/entities/certification";
import { useT } from "@/shared/lib/i18n";
import { Section } from "@/shared/ui/layout";
import { DecodeReveal } from "@/shared/ui/motion";
import { cx } from "@/utils/cx";

/** 取得した資格。先頭に Credly のプロフィール、カードは各資格の公式の説明ページへ */
export function Certifications() {
  const t = useT();
  return (
    <Section
      id="certifications"
      title="Certification"
      titleAside={
        // 見出しの横の Credly も、中身と同じく文字が記号から定まって出る
        <DecodeReveal className="shrink-0">
          <a
            href={CREDLY_PROFILE_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t({ ja: "Credly で取得したバッジを見る", en: "See my badges on Credly" })}
            className="group flex shrink-0 items-center gap-2 rounded-full font-mono text-[0.875rem] text-text-secondary outline-none transition-colors hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
          >
            {/* ロゴは黒い画像のため、明るい丸の上に置く（トップの SNS と同じ） */}
            <span className="lift flex size-9 shrink-0 items-center justify-center rounded-full bg-text-primary">
              <img src="/credly_home.svg" alt="" className="size-5 object-contain" />
            </span>
            <span className="underline decoration-separator-border underline-offset-[6px] transition-colors group-hover:decoration-accent-400">{t({ ja: "Credly(資格のバッジ)", en: "Credly (certification badges)" })}</span>
          </a>
        </DecodeReveal>
      }
    >
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {certifications.map((c) => (
          <li key={c.href}>
            <a
              href={c.href}
              target="_blank"
              rel="noopener noreferrer"
              className="lift relative isolate flex h-full w-full flex-col gap-1 overflow-hidden rounded-lg border border-separator-border bg-background-primary-default px-4 py-3.5 ps-5 outline-none hover:border-border-button-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring"
            >
              <span className={cx("absolute inset-y-0 start-0 w-1", c.color)} aria-hidden />
              {/* バッジは右下に薄く敷く（文字より後ろ。読みやすさを優先） */}
              {c.badge && (
                <img
                  src={c.badge}
                  alt=""
                  aria-hidden
                  loading="lazy"
                  className="pointer-events-none absolute -bottom-6 -end-4 -z-10 h-36 w-auto select-none opacity-[0.12]"
                />
              )}
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
