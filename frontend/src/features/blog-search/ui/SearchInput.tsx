import { RiSearchLine } from "@remixicon/react";
import { Input } from "@/components/base/input/input";
import { useT } from "@/shared/lib/i18n";

/** タイトル検索 */
export function SearchInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const t = useT();
  return (
    <Input
      aria-label={t({ ja: "タイトル検索", en: "Search titles" })}
      type="search"
      value={value}
      onChange={onChange}
      placeholder={t({ ja: "タイトル検索...", en: "Search titles..." })}
      leadingIcon={RiSearchLine}
      className="w-full max-w-md"
    />
  );
}
