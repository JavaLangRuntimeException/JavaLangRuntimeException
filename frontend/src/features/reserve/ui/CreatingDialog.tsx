import { useT } from "@/shared/lib/i18n";
import { TerminalLoadingDialog } from "@/shared/ui/terminal";

/** 予定の作成中（閉じられない） */
export function CreatingDialog({ isOpen }: { isOpen: boolean }) {
  const t = useT();
  return (
    <TerminalLoadingDialog
      isOpen={isOpen}
      title={t({ ja: "予定を作成します", en: "Creating your meeting" })}
      message={t({ ja: "予定を作成しています…", en: "Creating your meeting…" })}
      variant="reserve"
    />
  );
}
