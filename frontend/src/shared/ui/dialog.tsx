import type { ReactNode } from "react";
import { Dialog as AriaDialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { CloseButton } from "@/components/base/buttons/close-button";
import { cx } from "@/utils/cx";

// モーダル（React Aria の Modal + Dialog）。フォーカスの閉じ込め・Esc・背景スクロールの停止は React Aria が行う
export function Dialog({
  isOpen,
  onOpenChange,
  title,
  children,
  footer,
  size = "medium",
  isDismissable = true,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "small" | "medium" | "large";
  /** 送信中など、外側のクリックや Esc で閉じさせたくないときは false */
  isDismissable?: boolean;
}) {
  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable={isDismissable}
      isKeyboardDismissDisabled={!isDismissable}
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
    >
      <Modal
        className={cx(
          "max-h-[90dvh] w-full overflow-hidden rounded-t-3xl border border-border-button-default bg-background-primary-default shadow-xl sm:rounded-3xl",
          size === "small" && "sm:max-w-md",
          size === "medium" && "sm:max-w-xl",
          size === "large" && "sm:max-w-3xl",
        )}
      >
        <AriaDialog className="flex max-h-[90dvh] flex-col outline-none">
          <div className="flex items-start justify-between gap-4 border-b border-separator-border px-6 py-4">
            <Heading slot="title" className="text-headline-semibold text-text-primary">
              {title}
            </Heading>
            {isDismissable && <CloseButton onClick={() => onOpenChange(false)} aria-label="閉じる" />}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-separator-border px-6 py-4">{footer}</div>}
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  );
}
