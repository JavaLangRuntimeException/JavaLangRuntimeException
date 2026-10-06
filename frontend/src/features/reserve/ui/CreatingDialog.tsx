import { TerminalLoadingDialog } from "@/shared/ui/terminal";

/** 予定の作成中（閉じられない） */
export function CreatingDialog({ isOpen }: { isOpen: boolean }) {
  return <TerminalLoadingDialog isOpen={isOpen} title="予定を作成します" message="予定を作成しています…" variant="reserve" />;
}
