import { Select, SelectItem } from "@/components/base/select/select";
import { LOCATION_OPTIONS } from "@/entities/work-location";

/** 勤務場所の選択（選択肢は旧管理画面と同じ順） */
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
        <SelectItem key={opt} id={opt} textValue={opt}>
          {opt}
        </SelectItem>
      ))}
    </Select>
  );
}
