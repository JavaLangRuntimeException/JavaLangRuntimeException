import { Select, SelectItem } from "@/components/base/select/select";
import { LOCATION_OPTIONS, locationName } from "@/entities/work-location";
import { useLocale } from "@/shared/lib/i18n";

/** 勤務場所の選択（選択肢は旧管理画面と同じ順。値は日本語の名前のまま、見せる名前だけ言語で変える） */
export function LocationSelect({
  value,
  onChange,
  label,
  size = "md",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const locale = useLocale();
  return (
    <Select
      aria-label={label}
      size={size}
      className={className}
      triggerClassName="w-full"
      selectedKey={value}
      onSelectionChange={(key) => key != null && onChange(String(key))}
    >
      {LOCATION_OPTIONS.map((opt) => (
        <SelectItem key={opt} id={opt} textValue={locationName(opt, locale)}>
          {locationName(opt, locale)}
        </SelectItem>
      ))}
    </Select>
  );
}
