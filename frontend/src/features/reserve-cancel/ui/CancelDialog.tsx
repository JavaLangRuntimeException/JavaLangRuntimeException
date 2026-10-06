import { useEffect, useRef, useState } from "react";
import { ConnectError } from "@connectrpc/connect";
import { RiLoader4Line } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { reservationApi } from "@/shared/api/clients";
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
    const t = setTimeout(() => setShowAutoFillBanner(false), 3000);
    return () => clearTimeout(t);
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
      setError("EventIDを入力してください");
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
      // サーバーが返したエラーコード（webhook_failed など）を出す。届かなければ旧実装と同じ文言
      setError(ConnectError.from(err).metadata.get("x-error-code") || "削除に失敗しました");
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
      title={
        success ? "予定を削除しました。" : "予定の取り消し"
      }
      footer={
        deleting ? undefined : success ? (
          <Button variant="primary" onClick={finish}>
            閉じる
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={handleClose}>
              キャンセル
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={!eventId.trim()}>
              予定を取り消す
            </Button>
          </>
        )
      }
    >
      {deleting ? (
        <div className="flex flex-col items-center gap-3 py-8 text-body-medium text-text-secondary" role="status">
          <RiLoader4Line className="size-7 animate-spin text-accent-300 motion-reduce:animate-none" aria-hidden />
          削除中...
        </div>
      ) : success ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2.5 rounded-xl bg-notification-success-background px-4 py-3 text-body-2-regular text-notification-success-foreground">
            Googleカレンダーから予定が削除され、参加者にキャンセル通知が送信されました。
          </div>
          <p className="text-center text-caption-1-regular text-text-tertiary">5秒後にこの画面は閉じます</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2.5 rounded-xl bg-notification-information-background px-4 py-3 text-notification-information-foreground">
            <div className="text-body-2-regular">
              <p>EventIDは以下の場所で確認できます：</p>
              <ul className="mt-1.5 list-disc space-y-1 ps-5 text-caption-1-regular">
                <li>招待されたGoogleカレンダーの予定の説明欄</li>
                <li>Googleカレンダーからの招待メール</li>
              </ul>
            </div>
          </div>
          {showAutoFillBanner && (
            <div role="status" className="flex items-center gap-2 rounded-xl bg-notification-success-background px-4 py-2.5 text-body-2-regular text-notification-success-foreground">
              EventIDを自動入力しました
            </div>
          )}
          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-xl bg-notification-error-background px-4 py-2.5 text-body-2-regular text-notification-error-foreground">
              <span className="break-all">{error}</span>
            </div>
          )}
          <Input label="EventID" inputDir="ltr" placeholder="例: ehrkq640ka16dbfj28clmgln9g" value={eventId} onChange={setEventId} isDisabled={deleting} />
        </div>
      )}
    </Dialog>
  );
}
