import { Select, SelectItem } from "@/components/base/select/select";
import { PURPOSES } from "@/shared/config/purposes";
import { FieldCard, FieldError } from "./parts";

export function PurposeField({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <FieldCard title="ご相談内容">
      <Select
        aria-label="ご相談内容"
        placeholder="---選択してください---"
        className="w-full"
        popoverClassName="w-[min(36rem,calc(100vw-2rem))]"
        selectedKey={value || null}
        onSelectionChange={(k) => k != null && onChange(String(k))}
      >
        {PURPOSES.map((p) => (
          <SelectItem key={p.value} id={p.value} textValue={p.label}>
            {p.label}
          </SelectItem>
        ))}
      </Select>
      <FieldError>{error}</FieldError>
    </FieldCard>
  );
}
