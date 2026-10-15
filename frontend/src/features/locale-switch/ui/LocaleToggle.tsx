import { useAtom } from "jotai";
import { localeAtom, type Locale } from "@/shared/lib/i18n";
import { cx } from "@/utils/cx";

// 表示する言語の切り替え（JA / EN）。今の言語を塗って見せ、押した方へ切り替える

const OPTIONS: { value: Locale; label: string; name: string }[] = [
  { value: "ja", label: "JA", name: "日本語" },
  { value: "en", label: "EN", name: "English" },
];

export function LocaleToggle({ className }: { className?: string }) {
  const [locale, setLocale] = useAtom(localeAtom);
  return (
    <div role="group" aria-label={locale === "ja" ? "表示言語" : "Language"} className={cx("inline-flex shrink-0 rounded-lg border border-separator-border p-0.5", className)}>
      {OPTIONS.map((o) => {
        const active = o.value === locale;
        return (
          <button
            key={o.value}
            type="button"
            lang={o.value}
            aria-label={o.name}
            aria-pressed={active}
            onClick={() => setLocale(o.value)}
            className={cx(
              "meta rounded-md px-1.5 py-0.5 text-caption-1-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-border-focus-ring",
              active ? "bg-background-secondary-hover text-text-primary" : "text-text-tertiary hover:text-text-primary",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
