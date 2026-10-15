import { Textarea } from "@/components/base/textarea/textarea";
import { useT } from "@/shared/lib/i18n";
import { FieldCard, FieldNote } from "./parts";

export function MeetingNoteField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useT();
  const title = t({ ja: "ご相談詳細(任意)", en: "Details (optional)" });
  return (
    <FieldCard title={title}>
      <Textarea
        aria-label={title}
        placeholder={t({ ja: "当日話したい内容や事前共有事項があればご記入ください", en: "Let us know what you would like to discuss or anything to share in advance" })}
        rows={5}
        value={value}
        onChange={onChange}
      />
      <FieldNote>{t({ ja: "Googleカレンダーの予定の詳細に記載されます（任意）。", en: "This will be added to the description of the Google Calendar event (optional)." })}</FieldNote>
    </FieldCard>
  );
}
