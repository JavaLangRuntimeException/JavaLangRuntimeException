"use client";

import React from "react";
import { NotebookText } from "lucide-react";
import { PURPOSES } from "../../../shared/config/purposes";
import { useBodyScrollLock } from "../../../shared/lib/useBodyScrollLock";

export function ConfirmModal({
  onClose,
  onSubmit,
  submitting = false,
  details,
  calendarLoading = false,
}: {
  onClose: () => void;
  onSubmit: () => void;
  submitting?: boolean;
  details: {
    year: number | null;
    month: number | null;
    day: number | null;
    weekday: string;
    startHour: number | null;
    startMin: number | null;
    endHour: number | null;
    endMin: number | null;
    name: string;
    purpose: string;
    contactMethod: "meet" | "discord" | "slack" | "other" | "offline" | "";
    discordName: string;
    slackName: string;
    otherNote: string;
    email: string;
    offlinePlaceLink?: string;
    offlinePlaceName?: string;
    offlinePlaceDetail?: string;
    meetingNote?: string;
  };
  calendarLoading?: boolean;
}) {
  useBodyScrollLock(true);
  const hasMeetingNote = !!details.meetingNote;
  const hasPlaceDetail = !!details.offlinePlaceDetail;
  const hasPlaceName = !!(details.offlinePlaceName && details.offlinePlaceName.trim());
  const shouldShowToggle = hasMeetingNote || hasPlaceDetail;
  const [showDetail, setShowDetail] = React.useState(false);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-3 overflow-y-auto overscroll-none">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl max-h-[85vh]">
        <div className="flex items-center gap-2 border-b border-zinc-200 bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-3">
          <NotebookText className="h-5 w-5 text-white" aria-hidden="true" />
          <h3 className="text-base font-semibold text-white">最終確認</h3>
        </div>
        <div className="p-5 overflow-y-auto overscroll-contain">
          <div className="grid grid-cols-2 gap-3 text-sm text-zinc-900">
            <div className="rounded-lg bg-zinc-50 p-3">
              <div className="text-xs text-zinc-500">日付</div>
              <div className="mt-1 font-medium">{calendarLoading ? "読み込み中..." : `${details.year ?? "XXXX"}/${padOrXX(details.month)}/${padOrXX(details.day)}(${details.weekday || "X"})`}</div>
            </div>
            <div className="rounded-lg bg-zinc-50 p-3">
              <div className="text-xs text-zinc-500">時間</div>
              <div className="mt-1 font-medium">{calendarLoading ? "読み込み中..." : formatTimeRange(details.startHour, details.startMin, details.endHour, details.endMin)}</div>
            </div>
            <div className="rounded-lg bg-zinc-50 p-3">
              <div className="text-xs text-zinc-500">お名前(本名)</div>
              <div className="mt-1 font-medium">{details.name || "(未入力)"}</div>
            </div>
            <div className="rounded-lg bg-zinc-50 p-3 col-span-2">
              <div className="text-xs text-zinc-500">ご相談内容</div>
              <div className="mt-1 font-medium whitespace-pre-wrap break-all text-[13px] leading-relaxed text-zinc-800 h-[1.75rem] overflow-y-auto pr-1">{PURPOSES.find((p) => p.value === details.purpose)?.label || details.purpose}</div>
            </div>
            <div className="rounded-lg bg-zinc-50 p-3 col-span-2">
              <div className="text-xs text-zinc-500">ミーティング媒体</div>
              <div className="mt-1 font-medium">
                {details.contactMethod === "meet" ? "GoogleMeet" : details.contactMethod === "offline" ? "オフライン" : details.contactMethod}
                {details.contactMethod === "discord" && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-700">Discord名: {details.discordName || "(必須)"}</span>
                )}
                {details.contactMethod === "slack" && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-700">Slack名: {details.slackName || "(必須)"}</span>
                )}
                {details.contactMethod === "other" && details.otherNote && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-700">備考: {details.otherNote}</span>
                )}
              </div>
            </div>
            <div className="rounded-lg bg-zinc-50 p-3 col-span-2">
              <div className="text-xs text-zinc-500">メール</div>
              <div className="mt-1 font-medium">{details.email || "(メール未入力)"}</div>
            </div>
            {details.contactMethod !== "offline" && hasMeetingNote && (
              <div className="col-span-2">
                <button
                  type="button"
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  onClick={() => setShowDetail((v) => !v)}
                >
                  {showDetail ? "ご相談詳細を隠す" : "ご相談詳細を表示"}
                </button>
              </div>
            )}
            {details.contactMethod === "offline" && (
              <>
                <div className="rounded-lg bg-zinc-50 p-3 col-span-2">
                  <div className="text-xs text-zinc-500">場所の名称(自動入力)</div>
                  <div className="mt-1 font-medium">{details.offlinePlaceName || "(取得できませんでした)"}</div>
                </div>
                {hasPlaceName && shouldShowToggle && (
                  <div className="col-span-2">
                    <button
                      type="button"
                      className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                      onClick={() => setShowDetail((v) => !v)}
                    >
                      {showDetail ? "ご相談詳細を隠す" : "ご相談詳細を表示"}
                    </button>
                  </div>
                )}
                {showDetail && details.offlinePlaceDetail && (
                  <div className="rounded-lg bg-zinc-50 p-3 col-span-2">
                    <div className="text-xs text-zinc-500">場所の詳細</div>
                    <div className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-800">{details.offlinePlaceDetail}</div>
                  </div>
                )}
              </>
            )}
            {showDetail && details.meetingNote && (
              <div className="rounded-lg bg-zinc-50 p-3 col-span-2">
                <div className="text-xs text-zinc-500">ご相談詳細</div>
                <div className="mt-1 whitespace-pre text-[13px] leading-relaxed text-zinc-800 h-24 w-[20ch] overflow-auto pr-1">{details.meetingNote}</div>
              </div>
            )}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 hover:bg-zinc-50" onClick={onClose}>
              キャンセル
            </button>
            <button className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-60" onClick={onSubmit} disabled={submitting}>
              送信する
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}
function padOrXX(n: number | null): string {
  if (n == null) return "XX";
  return pad(n);
}
function formatTimeRange(sh: number | null, sm: number | null, eh: number | null, em: number | null): string {
  if (sh == null || sm == null || eh == null || em == null) return "XX : XX ~ XX : XX";
  return `${pad(sh)} : ${pad(sm)} ~ ${pad(eh)} : ${pad(em)}`;
}


