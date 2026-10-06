import type { RemixiconComponentType } from "@remixicon/react";
import { Dialog } from "@/shared/ui/dialog";
import { CONTACT_COMMANDS, RESERVE_COMMANDS } from "./commands";
import { TerminalLines } from "./TerminalLines";
import { useTerminalStream } from "./use-terminal-stream";

const TIMING = { typing: 5, afterCommand: 30, outputLine: 20, pause: 100, maxLines: 12 };

function Stream({ variant }: { variant: "reserve" | "contact" }) {
  const lines = useTerminalStream(variant === "reserve" ? RESERVE_COMMANDS : CONTACT_COMMANDS, 0, TIMING);
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden px-4 py-3 font-mono text-[9px] leading-relaxed opacity-60 select-none sm:text-[10px]">
      <TerminalLines lines={lines} cursorClassName="h-[10px] w-[4px]" />
    </div>
  );
}

/** 送信中（閉じられない）。背後にその処理らしい CLI コマンドが流れる（旧 TerminalLoadingModal と同じ内容） */
export function TerminalLoadingDialog({
  isOpen,
  title,
  message,
  icon: Icon,
  variant,
}: {
  isOpen: boolean;
  title: string;
  message: string;
  icon: RemixiconComponentType;
  variant: "reserve" | "contact";
}) {
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={() => {}}
      isDismissable={false}
      size="small"
      title={
        <span className="inline-flex items-center gap-2">
          <Icon className="size-5 text-accent-500" aria-hidden />
          {title}
        </span>
      }
    >
      <div className="relative -mx-6 -my-5 min-h-48 overflow-hidden bg-background-secondary-default/60 px-6 py-10">
        {isOpen && <Stream variant={variant} />}
        <div className="relative z-10 flex flex-col items-center gap-4 text-center" role="status">
          <span className="size-12 animate-spin rounded-full border-[3px] border-border-button-default border-t-accent-500 motion-reduce:animate-none" aria-hidden />
          <p className="rounded-lg bg-background-primary-default/80 px-3 py-1 text-body-medium text-text-primary backdrop-blur-sm">{message}</p>
        </div>
      </div>
    </Dialog>
  );
}
