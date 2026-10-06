import { atom } from "jotai";

// 予約・お問い合わせの送信中はヘッダーのナビゲーションを止める（旧 LoadingContext と同じ）
export const reserveSubmittingAtom = atom(false);
export const contactSubmittingAtom = atom(false);
export const navLockedAtom = atom((get) => get(reserveSubmittingAtom) || get(contactSubmittingAtom));
