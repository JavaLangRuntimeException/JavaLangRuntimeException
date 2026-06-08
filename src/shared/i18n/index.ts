"use client";

import { atom, useAtomValue, useSetAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import type { Lang } from "./translations";
import { translations } from "./translations";

// Persist language selection in localStorage
export const langAtom = atomWithStorage<Lang>("lang", "ja");

// Convenience hook: returns the current language
export function useLang(): Lang {
  return useAtomValue(langAtom);
}

// Convenience hook: returns a setter for the language
export function useSetLang() {
  return useSetAtom(langAtom);
}

// Translation helper – returns the value for the current language
export function useT() {
  const lang = useLang();

  return function t<T extends { ja: unknown; en: unknown }>(entry: T): T[Lang] {
    return entry[lang];
  };
}

// Re-export for convenience
export { translations, type Lang } from "./translations";
