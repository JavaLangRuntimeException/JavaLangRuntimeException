import { useRef, type ReactNode } from "react";
import { motion, useInView, useReducedMotion, useScroll, useSpring } from "motion/react";
import { cx } from "@/utils/cx";
import { CURTAIN_EASE, EASE, itemVariants, itemVariantsReduced, listVariants } from "./variants";

// スクロールの演出。入り口の演出（widgets/intro）と同じ語彙でそろえる:
//  - ぼかしから浮かび上がる（Reveal / RevealList）
//  - 細い線が左から伸びる（Rule）
//  - 幕が上へ開く（Curtain）
// すべて 1 回だけ。動きを減らす設定では隠さず、最初から出しておく

const VIEWPORT = { once: true, margin: "0px 0px -10% 0px" } as const;

// initial / whileInView は使わず、いつも animate で「隠す / 出す」を指定する。
// ページ遷移の AnimatePresence（initial={false}）の中では、最初に描かれる要素の initial が無視され、
// whileInView だけだと最初から見えてしまうため
function useShow(show: boolean | undefined) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, VIEWPORT);
  const reduced = useReducedMotion();
  return [ref, Boolean(reduced) || (show ?? inView)] as const;
}

/**
 * ぼかしから浮かび上がる。show を渡さなければ画面に入ったとき、渡せば show が true になったとき
 * （見出しが出終わってから中身を出す、など順番を付けたいとき）
 */
export function Reveal({ children, className, delay = 0, y = 18, show }: { children: ReactNode; className?: string; delay?: number; y?: number; show?: boolean }) {
  const reduced = useReducedMotion();
  const [ref, visible] = useShow(show);
  const hidden = { opacity: 0, y, filter: "blur(8px)" };
  const shown = reduced ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)", transitionEnd: { filter: "none", transform: "none" } };
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={hidden}
      animate={visible ? shown : hidden}
      transition={visible && !reduced ? { duration: 0.8, ease: EASE, delay } : { duration: 0 }}
    >
      {children}
    </motion.div>
  );
}

/** 子（RevealItem）を少しずつずらして浮かび上がらせる */
export function RevealList({ children, className, as = "div", stagger = 0.06, ...rest }: { children: ReactNode; className?: string; as?: "div" | "ul" | "nav"; stagger?: number; "aria-label"?: string }) {
  const Comp = motion[as];
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, VIEWPORT);
  const reduced = useReducedMotion();
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- motion[as] の ref の型が要素ごとに違う
    <Comp ref={ref as any} className={className} variants={listVariants} custom={stagger} initial="hidden" animate={inView || reduced ? "shown" : "hidden"} {...rest}>
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

/** 左から伸びる細い線（入り口の演出の線と同じ）。show を渡さなければ画面に入ったとき、渡せば true になったとき */
export function Rule({ className, delay = 0, duration = 0.9, show }: { className?: string; delay?: number; duration?: number; show?: boolean }) {
  const reduced = useReducedMotion();
  const [ref, visible] = useShow(show);
  const scaleX = reduced || visible ? 1 : 0;
  return (
    <motion.div
      ref={ref}
      aria-hidden="true"
      className={cx("h-px origin-left", className)}
      initial={{ scaleX }}
      animate={{ scaleX }}
      transition={visible ? { duration, ease: EASE, delay } : { duration: 0 }}
    />
  );
}

/** 画面に入ったら、上へ幕が開くように中身が見える（画像など） */
export function Curtain({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduced = useReducedMotion();
  const [ref, visible] = useShow(undefined);
  if (reduced) return <div className={className}>{children}</div>;
  const closed = { clipPath: "inset(100% 0% 0% 0%)" };
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={closed}
      animate={visible ? { clipPath: "inset(0% 0% 0% 0%)", transitionEnd: { clipPath: "none" } } : closed}
      transition={visible ? { duration: 0.9, ease: CURTAIN_EASE, delay } : { duration: 0 }}
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
