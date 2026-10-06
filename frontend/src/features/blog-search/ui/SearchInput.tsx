import { RiSearchLine } from "@remixicon/react";
import { Input } from "@/components/base/input/input";

/** タイトル検索 */
export function SearchInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Input
      aria-label="タイトル検索"
      type="search"
      value={value}
      onChange={onChange}
      placeholder="タイトル検索..."
      leadingIcon={RiSearchLine}
      className="w-full max-w-md"
    />
  );
}
