import { useEffect, useRef, useState } from "react";
import { ConnectError } from "@connectrpc/connect";
import { RiLoader4Line } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { reservationApi } from "@/shared/api/clients";
import { useT } from "@/shared/lib/i18n";
import { Dialog } from "@/shared/ui/dialog";

/** 予定の取り消し（EventID を入れて削除）。文言は旧 CancelModal と同じ */
export function CancelDialog({
  isOpen,
  onClose,
  onDeleteSuccess,
  initialEventId = "",
}: {
  isOpen: boolean;
  onClose: () => void;
  onDeleteSuccess?: () => void;
  initialEventId?: string;
}) {
  const t = useT();
  const [eventId, setEventId] = useState(initialEventId);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showAutoFillBanner, setShowAutoFillBanner] = useState(false);
  const lockRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 完了画面から開いたときは EventID を自動入力して知らせる
  useEffect(() => {
    if (!initialEventId) return;
    setEventId(initialEventId);
    setShowAutoFillBanner(true);
    const timer = setTimeout(() => setShowAutoFillBanner(false), 3000);
    return () => clearTimeout(timer);
  }, [initialEventId]);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const finish = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setSuccess(false);
    lockRef.current = false;
    onClose();
    onDeleteSuccess?.();
  };

  const handleDelete = async () => {
    // 連打防止
    if (lockRef.current) return;
    if (!eventId.trim()) {
      setError(t({ ja: "EventIDを入力してください", en: "Please enter the EventID" }));
      return;
    }
    lockRef.current = true;
    setDeleting(true);
    setError(null);
    try {
      await reservationApi.cancelReservation({ eventId: eventId.trim() });
      setSuccess(true);
      setEventId("");
      timeoutRef.current = setTimeout(finish, 5000);
    } catch (err) {
      // サーバーが返したエラーコード（google_delete_failed など）を出す。届かなければ旧実装と同じ文言
      setError(ConnectError.from(err).metadata.get("x-error-code") || t({ ja: "削除に失敗しました", en: "Failed to cancel the meeting" }));
      lockRef.current = false;
    } finally {
      setDeleting(false);
    }
  };

  const handleClose = () => {
    if (deleting) return;
    setEventId("");
    setError(null);
    setSuccess(false);
    onClose();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(o) => !o && (success ? finish() : handleClose())}
      isDismissable={!deleting}
      size="small"
      title={success ? t({ ja: "予定を削除しました。", en: "The meeting has been canceled." }) : t({ ja: "予定の取り消し", en: "Cancel a meeting" })}
      footer={
        deleting ? undefined : success ? (
          <Button variant="primary" onClick={finish}>
            {t({ ja: "閉じる", en: "Close" })}
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={handleClose}>
              {t({ ja: "キャンセル", en: "Back" })}
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={!eventId.trim()}>
              {t({ ja: "予定を取り消す", en: "Cancel the meeting" })}
            </Button>
          </>
        )
      }
    >
      {deleting ? (
        <div className="flex flex-col items-center gap-3 py-8 text-body-medium text-text-secondary" role="status">
          <RiLoader4Line className="size-7 animate-spin text-accent-300 motion-reduce:animate-none" aria-hidden />
          {t({ ja: "削除中...", en: "Canceling..." })}
        </div>
      ) : success ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2.5 rounded-xl bg-notification-success-background px-4 py-3 text-body-2-regular text-notification-success-foreground">
            {t({
              ja: "Googleカレンダーから予定が削除され、参加者にキャンセル通知が送信されました。",
              en: "The event was removed from Google Calendar and a cancellation notice was sent to the attendees.",
            })}
          </div>
          <p className="text-center text-caption-1-regular text-text-tertiary">{t({ ja: "5秒後にこの画面は閉じます", en: "This dialog will close in 5 seconds" })}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2.5 rounded-xl bg-notification-information-background px-4 py-3 text-notification-information-foreground">
            <div className="text-body-2-regular">
              <p>{t({ ja: "EventIDは以下の場所で確認できます：", en: "You can find the EventID in:" })}</p>
              <ul className="mt-1.5 list-disc space-y-1 ps-5 text-caption-1-regular">
                <li>{t({ ja: "招待されたGoogleカレンダーの予定の説明欄", en: "The description of the Google Calendar event you were invited to" })}</li>
                <li>{t({ ja: "Googleカレンダーからの招待メール", en: "The invitation email from Google Calendar" })}</li>
              </ul>
            </div>
          </div>
          {showAutoFillBanner && (
            <div role="status" className="flex items-center gap-2 rounded-xl bg-notification-success-background px-4 py-2.5 text-body-2-regular text-notification-success-foreground">
              {t({ ja: "EventIDを自動入力しました", en: "The EventID has been filled in" })}
            </div>
          )}
          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-xl bg-notification-error-background px-4 py-2.5 text-body-2-regular text-notification-error-foreground">
              <span className="break-all">{error}</span>
            </div>
          )}
          <Input label="EventID" inputDir="ltr" placeholder={t({ ja: "例: ehrkq640ka16dbfj28clmgln9g", en: "e.g. ehrkq640ka16dbfj28clmgln9g" })} value={eventId} onChange={setEventId} isDisabled={deleting} />
        </div>
      )}
    </Dialog>
  );
}
