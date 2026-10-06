import { atom } from "jotai";

// 回答の状態（旧 src/feature/questionnaire/state.ts と同じく保存はしない）
export type VrUsage = "none" | "monthly" | "weekly" | "daily";
export type TrialPattern = "standing_humanSwinging" | "fours_humanSwinging" | "standing_bearRolling" | "fours_bearRolling";
export const RESPONSE_KEYS = Array.from({ length: 18 }, (_, i) => `r${i + 1}`) as ResponseKey[];
export type ResponseKey = `r${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18}`;

export const nameAtom = atom<string>("");
export const vrUsageAtom = atom<VrUsage | null>(null);
export const heightAtom = atom<number | null>(null);
export const trialPatternAtom = atom<TrialPattern | null>(null);
export const responsesAtom = atom<Record<ResponseKey, number | null>>(
  Object.fromEntries(RESPONSE_KEYS.map((k) => [k, null])) as Record<ResponseKey, number | null>,
);
