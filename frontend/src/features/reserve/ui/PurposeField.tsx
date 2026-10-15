import { Select, SelectItem } from "@/components/base/select/select";
import { PURPOSES } from "@/shared/config/purposes";
import { useT } from "@/shared/lib/i18n";
import { FieldCard, FieldError } from "./parts";

export function PurposeField({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  const t = useT();
  const title = t({ ja: "ご相談内容", en: "Topic" });
  return (
    <FieldCard title={title}>
      <Select
        aria-label={title}
        placeholder={t({ ja: "---選択してください---", en: "--- Please select ---" })}
        className="w-full"
        popoverClassName="w-[min(36rem,calc(100vw-2rem))]"
        selectedKey={value || null}
        onSelectionChange={(k) => k != null && onChange(String(k))}
      >
        {PURPOSES.map((p) => (
          <SelectItem key={p.value} id={p.value} textValue={t(p.label)}>
            {t(p.label)}
          </SelectItem>
        ))}
      </Select>
      <FieldError>{error}</FieldError>
    </FieldCard>
  );
}
