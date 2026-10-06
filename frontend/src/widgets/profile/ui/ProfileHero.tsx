import { socialLinks } from "@/entities/profile";

/** トップの名前とプロフィール（旧 HeroBackground のイントロ・ProfileHeader の文言をまとめて表示） */
export function ProfileHero() {
  return (
    <section className="flex flex-col items-center gap-8 border-b border-separator-border pb-12 pt-6 text-center sm:flex-row sm:items-center sm:gap-10 sm:text-start">
      <img
        src="/image.png"
        alt="棚橋 柊太"
        className="size-32 shrink-0 rounded-full border border-border-button-default object-cover sm:size-40"
      />
      <div className="flex min-w-0 flex-col gap-3">
        <p className="text-caption-1-semibold tracking-wider text-accent-600">JavaLangRuntimeException</p>
        <h1 className="text-display-3-semibold text-text-primary sm:text-display-2-semibold">taramanji</h1>
        <p className="text-headline-regular text-text-secondary">Engineer • Researcher • Photographer • Community Director</p>
        <div className="mt-2 flex flex-col gap-1">
          <p className="text-title-3-semibold text-text-primary">Shuta Tanahashi</p>
          <p className="text-body-regular text-text-secondary">
            Software Engineer
            <br />
            Backend Engineer
            <br />
            Photographer
            <br />
            XR Researcher
            <br />
            Community Director
          </p>
        </div>
        <ul className="mt-2 flex items-center justify-center gap-2 sm:justify-start" aria-label="SNS">
          {socialLinks.map((s) => (
            <li key={s.label}>
              <a
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.label}
                title={s.label}
                className="flex size-10 items-center justify-center rounded-full border border-border-button-default bg-background-primary-default outline-none transition-[scale,background-color,border-color] duration-200 hover:scale-110 hover:border-border-button-hover hover:bg-background-primary-hover active:scale-95 motion-reduce:hover:scale-100 focus-visible:ring-2 focus-visible:ring-border-focus-ring"
              >
                {/* ロゴはすべて黒い画像のため、明るい面の上に置く */}
                <img src={s.imgSrc} alt="" className="size-5 object-contain" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
