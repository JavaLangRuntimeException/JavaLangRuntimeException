import { useRef } from "react";
import { useAtomValue } from "jotai";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { socialLinks, tagline } from "@/entities/profile";
import { introPlayingAtom } from "@/shared/model/intro";
import { CURTAIN_EASE, DecodeText, EASE } from "@/shared/ui/motion";

/**
 * トップの名前とプロフィール（旧 HeroBackground のイントロ・ProfileHeader の文言をまとめて表示）。
 * 入り口の演出の幕が開いたら、同じ表現（幕・記号から定まる文字・伸びる線・ぼかし）で順に現れ、
 * スクロールすると少し遅れて上へ流れながら沈む
 */
export function ProfileHero() {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const ready = !useAtomValue(introPlayingAtom);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, reduced ? 0 : -80]);
  const opacity = useTransform(scrollYProgress, [0, 0.9], [1, reduced ? 1 : 0.25]);

  const fade = (delay: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 12, filter: "blur(6px)" },
          animate: ready ? { opacity: 1, y: 0, filter: "blur(0px)", transitionEnd: { filter: "none" } } : undefined,
          transition: { duration: 0.8, ease: EASE, delay },
        };

  return (
    <motion.section
      ref={ref}
      style={{ y, opacity }}
      className="flex flex-col items-center gap-8 pb-14 pt-8 text-center sm:flex-row sm:items-center sm:gap-12 sm:text-start"
    >
      <motion.div
        className="shrink-0"
        initial={reduced ? undefined : { clipPath: "inset(100% 0% 0% 0%)" }}
        animate={ready && !reduced ? { clipPath: "inset(0% 0% 0% 0%)", transitionEnd: { clipPath: "none" } } : undefined}
        transition={{ duration: 0.9, ease: CURTAIN_EASE, delay: 0.15 }}
      >
        <img src="/image.png" alt="棚橋 柊太" className="size-32 rounded-full object-cover ring-1 ring-separator-border sm:size-44" />
      </motion.div>
      <div className="flex min-w-0 flex-col gap-3">
        <h1 className="text-[3rem] font-semibold leading-none tracking-[-0.02em] text-text-primary sm:text-[4rem]">
          <DecodeText text="taramanji" ready={ready} delay={200} timing={{ stagger: 55, settle: 280 }} />
        </h1>
        <div className="relative mt-4 flex flex-col gap-2 ps-4 text-start">
          {/* 左の線は上から伸びる */}
          <motion.span
            aria-hidden="true"
            className="absolute inset-y-0 start-0 w-0.5 origin-top bg-accent-400"
            initial={{ scaleY: reduced ? 1 : 0 }}
            animate={ready ? { scaleY: 1 } : undefined}
            transition={{ duration: 0.9, ease: EASE, delay: 0.5 }}
          />
          <p className="text-[1.5rem] font-semibold leading-[1.4] tracking-[0.01em] text-text-primary [font-feature-settings:'palt'_1] sm:text-[1.75rem]">
            {tagline.lines.map((line, i) => (
              <DecodeText key={line.text} text={line.text} accent={line.accent} ready={ready} delay={650 + i * 420} className="block" timing={{ stagger: 60, settle: 280 }} />
            ))}
          </p>
          <motion.p {...fade(1.7)} className="text-[0.9375rem] leading-[1.8] text-text-secondary [word-break:auto-phrase]">
            {tagline.subtitle}
          </motion.p>
        </div>
        <motion.div {...fade(1.9)} className="mt-3 flex flex-col gap-1">
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
        </motion.div>
        <motion.ul {...fade(2.1)} className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 sm:justify-start" aria-label="SNS">
          {socialLinks.map((s) => (
            <li key={s.label}>
              <a
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-2 rounded-full font-mono text-[0.875rem] text-text-secondary outline-none transition-colors hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
              >
                {/* ロゴはすべて黒い画像のため、明るい丸の上に置く */}
                <span className="lift flex size-9 shrink-0 items-center justify-center rounded-full bg-text-primary">
                  <img src={s.imgSrc} alt="" className="size-5 object-contain" />
                </span>
                <span className="underline decoration-separator-border underline-offset-[6px] transition-colors group-hover:decoration-accent-400">{s.label}</span>
              </a>
            </li>
          ))}
        </motion.ul>
      </div>
    </motion.section>
  );
}
