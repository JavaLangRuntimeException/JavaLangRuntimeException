import { socialLinks, tagline } from "@/entities/profile";

/** トップの名前とプロフィール（旧 HeroBackground のイントロ・ProfileHeader の文言をまとめて表示） */
export function ProfileHero() {
  return (
    <section className="flex flex-col items-center gap-8 pb-14 pt-8 text-center sm:flex-row sm:items-center sm:gap-12 sm:text-start">
      <img
        src="/image.png"
        alt="棚橋 柊太"
        className="size-32 shrink-0 rounded-full object-cover ring-1 ring-separator-border sm:size-44"
      />
      <div className="flex min-w-0 flex-col gap-3">
        <h1 className="text-[3rem] font-semibold leading-none tracking-[-0.02em] text-text-primary sm:text-[4rem]">taramanji</h1>
        <div className="mt-4 flex flex-col gap-2 border-s-2 border-accent-400 ps-4 text-start">
          <p className="text-[1.5rem] font-semibold leading-[1.4] tracking-[0.01em] text-text-primary [font-feature-settings:'palt'_1] sm:text-[1.75rem]">
            {tagline.lines.map((line) => (
              <span key={line.text} className="block">
                {line.text.slice(0, line.accent[0])}
                <span className="text-accent-300">{line.text.slice(line.accent[0], line.accent[1])}</span>
                {line.text.slice(line.accent[1])}
              </span>
            ))}
          </p>
          <p className="text-[0.9375rem] leading-[1.8] text-text-secondary [word-break:auto-phrase]">{tagline.subtitle}</p>
        </div>
        <div className="mt-3 flex flex-col gap-1">
          <p className="text-[1.125rem] font-semibold text-text-primary">Shuta Tanahashi</p>
          <p className="text-[0.9375rem] leading-[1.9] text-text-secondary">
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
        <ul className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 sm:justify-start" aria-label="SNS">
          {socialLinks.map((s) => (
            <li key={s.label}>
              <a
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className="press font-mono text-[0.875rem] text-text-secondary underline decoration-separator-border underline-offset-[6px] outline-none transition-colors hover:text-text-primary hover:decoration-accent-400 focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-border-focus-ring"
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
