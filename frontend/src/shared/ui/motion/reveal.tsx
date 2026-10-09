import type { ReactNode } from "react";
import { motion, useReducedMotion, useScroll, useSpring } from "motion/react";
import { cx } from "@/utils/cx";
import { CURTAIN_EASE, EASE, itemVariants, itemVariantsReduced, listVariants } from "./variants";

// スクロールの演出。入り口の演出（widgets/intro）と同じ語彙でそろえる:
//  - ぼかしから浮かび上がる（Reveal / RevealList）
//  - 細い線が左から伸びる（Rule）
//  - 幕が上へ開く（Curtain）
// すべて 1 回だけ。動きを減らす設定ではフェードだけ、または何もしない

const VIEWPORT = { once: true, margin: "0px 0px -10% 0px" } as const;

/** 画面に入ったら、ぼかしから浮かび上がる */
export function Reveal({ children, className, delay = 0, y = 18 }: { children: ReactNode; className?: string; delay?: number; y?: number }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y, filter: "blur(8px)" }}
      whileInView={reduced ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)", transitionEnd: { filter: "none", transform: "none" } }}
      viewport={VIEWPORT}
      transition={{ duration: reduced ? 0.2 : 0.8, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

/** 子（RevealItem）を少しずつずらして浮かび上がらせる */
export function RevealList({ children, className, as = "div", stagger = 0.06, ...rest }: { children: ReactNode; className?: string; as?: "div" | "ul" | "nav"; stagger?: number; "aria-label"?: string }) {
  const Comp = motion[as];
  return (
    <Comp className={className} variants={listVariants} custom={stagger} initial="hidden" whileInView="shown" viewport={VIEWPORT} {...rest}>
      {children}
    </Comp>
  );
}

export function RevealItem({ children, className, as = "div" }: { children: ReactNode; className?: string; as?: "div" | "li" }) {
  const reduced = useReducedMotion();
  const Comp = motion[as];
  return (
    <Comp className={className} variants={reduced ? itemVariantsReduced : itemVariants}>
      {children}
    </Comp>
  );
}

/** 画面に入ったら左から伸びる細い線（入り口の演出の線と同じ） */
export function Rule({ className, delay = 0, duration = 0.9 }: { className?: string; delay?: number; duration?: number }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      aria-hidden="true"
      className={cx("h-px origin-left", className)}
      initial={{ scaleX: reduced ? 1 : 0 }}
      whileInView={{ scaleX: 1 }}
      viewport={VIEWPORT}
      transition={{ duration, ease: EASE, delay }}
    />
  );
}

/** 画面に入ったら、上へ幕が開くように中身が見える（画像など） */
export function Curtain({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ clipPath: "inset(100% 0% 0% 0%)" }}
      whileInView={{ clipPath: "inset(0% 0% 0% 0%)", transitionEnd: { clipPath: "none" } }}
      viewport={VIEWPORT}
      transition={{ duration: 0.9, ease: CURTAIN_EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

/** 画面の上端に、どこまで読んだかをアクセント色の細い線で出す */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 220, damping: 40, restDelta: 0.001 });
  return <motion.div aria-hidden="true" className="fixed inset-x-0 top-0 z-[60] h-px origin-left bg-accent-400" style={{ scaleX }} />;
}
