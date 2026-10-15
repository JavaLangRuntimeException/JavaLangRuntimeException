import { useCallback } from "react";
import { atom, useAtomValue } from "jotai";

// 表示する言語（日本語 / 英語）。文言は使う場所に { ja, en } で並べて書き、useT で選ぶ（キーの辞書は作らない）。
// 選んだ言語はこのブラウザに覚えておく。初めてなら、ブラウザの言語が日本語なら日本語、それ以外は英語

export type Locale = "ja" | "en";
/** 言語ごとの文言（値は文字列に限らない） */
export type L10n<T = string> = { ja: T; en: T };

const STORAGE_KEY = "locale";

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "ja" || saved === "en") return saved;
  } catch {
    // 保存できない環境（プライベートモードなど）では毎回ブラウザの言語から決める
  }
  if (typeof navigator === "undefined") return "ja";
  return navigator.language.toLowerCase().startsWith("ja") ? "ja" : "en";
}

const baseLocaleAtom = atom<Locale>(initialLocale());

export const localeAtom = atom(
  (get) => get(baseLocaleAtom),
  (_get, set, next: Locale) => {
    set(baseLocaleAtom, next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 覚えられなくても切り替えはできる
    }
  },
);

export function useLocale(): Locale {
  return useAtomValue(localeAtom);
}

/** 今の言語の文言を選ぶ関数を返す。t({ ja: "送信", en: "Send" }) */
export function useT() {
  const locale = useLocale();
  return useCallback(<T>(m: L10n<T>): T => m[locale], [locale]);
}

/** Intl / toLocaleString に渡す言語タグ */
export function intlLocale(locale: Locale) {
  return locale === "ja" ? "ja-JP" : "en-US";
}
