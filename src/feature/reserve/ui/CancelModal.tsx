"use client";

import React from "react";
import { Info } from "lucide-react";
import { AlertBanner } from "../../../shared/ui/AlertBanner";

export function CancelModal({
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
  const [eventId, setEventId] = React.useState(initialEventId);
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);
  const [showAutoFillBanner, setShowAutoFillBanner] = React.useState(false);
  const deleteLockRef = React.useRef(false);
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // initialEventIdが変更されたら更新し、バナーを1秒間表示
  React.useEffect(() => {
    if (initialEventId) {
      setEventId(initialEventId);
      setShowAutoFillBanner(true);
      setTimeout(() => {
        setShowAutoFillBanner(false);
      }, 3000);
    }
  }, [initialEventId]);

  const handleDelete = async () => {
    // 連打防止: 既にロックされている場合は何もしない
    if (deleteLockRef.current) return;

    if (!eventId.trim()) {
      setError("EventIDを入力してください");
      return;
    }

    // 即座にロックをかける
    deleteLockRef.current = true;
    setDeleting(true);
    setError(null);

    try {
      const response = await fetch("/api/reserve", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: eventId.trim() }),
      });

      const result = await response.json();

      if (result.ok) {
        setSuccess(true);
        setEventId("");
        timeoutRef.current = setTimeout(() => {
          setSuccess(false);
          deleteLockRef.current = false;
          onClose();
          if (onDeleteSuccess) {
            onDeleteSuccess();
          }
        }, 5000);
      } else {
        setError(result.error || "削除に失敗しました");
        deleteLockRef.current = false;
      }
    } catch {
      setError("削除に失敗しました");
      deleteLockRef.current = false;
    } finally {
      setDeleting(false);
    }
  };

  const handleClose = () => {
    if (!deleting) {
      setEventId("");
      setError(null);
      setSuccess(false);
      onClose();
    }
  };

  const handleCloseAfterSuccess = () => {
    // タイマーをキャンセル
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setSuccess(false);
    deleteLockRef.current = false;
    onClose();
    if (onDeleteSuccess) {
      onDeleteSuccess();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-3 overflow-y-auto backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/20 bg-white/95 shadow-2xl backdrop-blur">
        <div className="flex items-center gap-2 border-b border-white/20 bg-gradient-to-r from-red-500/90 to-rose-500/90 px-5 py-3 backdrop-blur">
          <div className="text-lg">{success ? "✅" : "🗑️"}</div>
          <h3 className="text-base font-semibold text-white drop-shadow">{success ? "予定を削除しました。" : "予定の取り消し"}</h3>
        </div>
        <div className="p-5">
          {deleting ? (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-600 mb-3" />
              <div className="text-sm font-medium text-zinc-700">削除中...</div>
            </div>
          ) : success ? (
            <div className="space-y-3 text-sm text-zinc-800">
              <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur">
                <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-emerald-400 to-green-500" />
                <div className="ml-3 flex items-center gap-3">
                  <Info className="mt-0.5 h-5 w-5 text-emerald-300 flex-shrink-0" aria-hidden="true" />
                  <p className="m-0 text-sm text-black/90">
                    Googleカレンダーから予定が削除され、参加者にキャンセル通知が送信されました。
                  </p>
                </div>
              </div>
              <div className="text-xs text-zinc-500 text-center">
                5秒後にこの画面は閉じます
              </div>
              <div className="flex justify-center">
                <button
                  className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800 touch-manipulation min-h-[44px] sm:min-h-0"
                  onClick={handleCloseAfterSuccess}
                >
                  閉じる
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-3 text-sm text-zinc-800">
                <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur">
                  <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-blue-400 to-indigo-500" />
                  <div className="ml-3 flex items-start gap-3">
                    <Info className="mt-0.5 h-5 w-5 text-blue-300 flex-shrink-0" aria-hidden="true" />
                    <div className="flex-1">
                      <p className="m-0 text-sm text-black/90">EventIDは以下の場所で確認できます：</p>
                      <ul className="mt-2 list-disc pl-5 space-y-1 text-xs text-black/80">
                        <li>招待されたGoogleカレンダーの予定の説明欄</li>
                        <li>Googleカレンダーからの招待メール</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {showAutoFillBanner && (
                  <AlertBanner message="EventIDを自動入力しました" variant="success" />
                )}

                {error && (
                  <div className="rounded-lg border border-white/20 bg-white/90 p-3 text-[13px] leading-relaxed text-red-700 shadow-lg backdrop-blur">
                    ❌ {error}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">
                    EventID
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 transition focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                    placeholder="例: ehrkq640ka16dbfj28clmgln9g"
                    value={eventId}
                    onChange={(e) => setEventId(e.target.value)}
                    disabled={deleting}
                  />
                </div>
              </div>

              <div className="mt-5 flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 justify-end">
                <button
                  className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={handleClose}
                  disabled={deleting}
                >
                  キャンセル
                </button>
                <button
                  className="rounded-md bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={handleDelete}
                  disabled={deleting || !eventId.trim()}
                >
                  {deleting ? "削除中..." : "予定を取り消す"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

