"use client";

import { useLang, useSetLang } from "../i18n";

export function LangToggle() {
  const lang = useLang();
  const setLang = useSetLang();

  return (
    <button
      onClick={() => setLang(lang === "ja" ? "en" : "ja")}
      className="relative inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-all duration-200 ring-1 ring-white/20 hover:ring-white/40 text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
      aria-label={lang === "ja" ? "Switch to English" : "日本語に切り替え"}
    >
      <span className={lang === "ja" ? "text-blue-500 font-bold" : "opacity-50"}>JP</span>
      <span className="text-zinc-400">/</span>
      <span className={lang === "en" ? "text-blue-500 font-bold" : "opacity-50"}>EN</span>
    </button>
  );
}
