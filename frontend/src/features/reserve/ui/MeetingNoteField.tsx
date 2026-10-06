import { RiFileTextLine } from "@remixicon/react";
import { Textarea } from "@/components/base/textarea/textarea";
import { FieldCard, FieldNote } from "./parts";

export function MeetingNoteField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <FieldCard title="ご相談詳細(任意)" icon={RiFileTextLine}>
      <Textarea
        aria-label="ご相談詳細(任意)"
        placeholder="当日話したい内容や事前共有事項があればご記入ください"
        rows={5}
        value={value}
        onChange={onChange}
      />
      <FieldNote>Googleカレンダーの予定の詳細に記載されます（任意）。</FieldNote>
    </FieldCard>
  );
}
