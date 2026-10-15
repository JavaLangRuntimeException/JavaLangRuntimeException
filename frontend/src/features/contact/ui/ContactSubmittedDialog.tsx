import { useEffect, useState } from "react";
import { useT } from "@/shared/lib/i18n";
import { Dialog } from "@/shared/ui/dialog";

/** 送信完了。数秒後に自動で閉じる（旧ページと同じく初回 5 秒、2 回目以降は 10 秒から数える） */
export function ContactSubmittedDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const t = useT();
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
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && onClose()} size="small" title={t({ ja: "お問い合わせを受け付けました", en: "We received your inquiry" })}>
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <p className="text-headline-medium text-text-primary">{t({ ja: "お問い合わせありがとうございます。", en: "Thank you for your inquiry." })}</p>
        <p className="text-body-regular text-text-secondary">
          {t({ ja: "確認メールをお送りいたしました。", en: "We have sent you a confirmation email." })}
          <br />
          {t({ ja: "スパム(迷惑)メールも合わせてご確認ください。", en: "Please also check your spam folder." })}
        </p>
        <p className="text-body-2-regular text-text-tertiary">{t({ ja: "※1週間以内にこちらから再度連絡いたします。", en: "* We will get back to you within a week." })}</p>
        <p className="w-full rounded-xl bg-background-secondary-default px-3 py-2 text-body-2-regular text-text-secondary" aria-live="polite">
          {t({ ja: `${countdown}秒後に自動で閉じます`, en: `Closing automatically in ${countdown} s` })}
        </p>
      </div>
    </Dialog>
  );
}
