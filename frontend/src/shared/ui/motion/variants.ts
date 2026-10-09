import { useReducedMotion } from "motion/react";

export const EASE = [0.22, 1, 0.36, 1] as const;
// 幕の開き（入り口の演出の幕と同じ）
export const CURTAIN_EASE = [0.76, 0, 0.24, 1] as const;
export const listVariants = {
  hidden: {},
  shown: (stagger: number) => ({ transition: { staggerChildren: stagger, delayChildren: 0.1 } }),
};
export const itemVariants = {
  hidden: { opacity: 0, y: 14, filter: "blur(6px)" },
  shown: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.7, ease: EASE }, transitionEnd: { filter: "none", transform: "none" } },
};
export const itemVariantsReduced = { hidden: { opacity: 0 }, shown: { opacity: 1, transition: { duration: 0.2 } } };

/** RevealList の子にする要素の variants（Link など、RevealItem で包めない要素に付ける） */
export function useRevealItemVariants() {
  return useReducedMotion() ? itemVariantsReduced : itemVariants;
}

