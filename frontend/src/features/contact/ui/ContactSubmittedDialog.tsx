import { useEffect, useState } from "react";
import { RiCheckboxCircleLine } from "@remixicon/react";
import { Dialog } from "@/shared/ui/dialog";

/** 送信完了。数秒後に自動で閉じる（旧ページと同じく初回 5 秒、2 回目以降は 10 秒から数える） */
export function ContactSubmittedDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (!isOpen) return;
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
      return () => clearTimeout(timer);
    }
    onClose();
    setCountdown(10);
  }, [isOpen, countdown, onClose]);

  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && onClose()} size="small" title="お問い合わせを受け付けました">
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <RiCheckboxCircleLine className="size-14 text-accent-600" aria-hidden />
        <p className="text-headline-medium text-text-primary">お問い合わせありがとうございます。</p>
        <p className="text-body-regular text-text-secondary">
          確認メールをお送りいたしました。
          <br />
          スパム(迷惑)メールも合わせてご確認ください。
        </p>
        <p className="text-body-2-regular text-text-tertiary">※1週間以内にこちらから再度連絡いたします。</p>
        <p className="w-full rounded-xl bg-background-secondary-default px-3 py-2 text-body-2-regular text-text-secondary" aria-live="polite">
          {countdown}秒後に自動で閉じます
        </p>
      </div>
    </Dialog>
  );
}
