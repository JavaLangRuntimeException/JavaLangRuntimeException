"use client";

import React from "react";
import { PURPOSES } from "../../../shared/config/purposes";
import { useBodyScrollLock } from "../../../shared/lib/useBodyScrollLock";
import { GlassCardSimple } from "../../../shared/ui/GlassCard";
import { CircleCheckLoader } from "../../../shared/ui/CircleCheckLoader";

export type CreatedInfo = {
  ok: boolean;
  eventId?: string;
  htmlLink?: string;
  meetLink?: string;
  error?: string;
  message?: string;
  detail?: unknown;
} | null;

export function CompletionModal({
  createdInfo,
  contactMethod,
  details,
  onClose,
  onOpenCancelModal,
  calendarLoading = false,
}: {
  createdInfo: CreatedInfo;
  contactMethod: "meet" | "discord" | "slack" | "other" | "offline";
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
    email: string;
    discordName: string;
    slackName: string;
    otherNote: string;
    offlinePlaceLink?: string;
    offlinePlaceName?: string;
    offlinePlaceDetail?: string;
    meetingNote?: string;
  };
  onClose: () => void;
  onOpenCancelModal?: (eventId: string) => void;
  calendarLoading?: boolean;
}) {
  const [copiedMeet, setCopiedMeet] = React.useState(false);
  const [copiedEventId, setCopiedEventId] = React.useState(false);
  useBodyScrollLock(!!createdInfo);
  const [showDetail, setShowDetail] = React.useState(false);
  const hasMeetingNote = !!details.meetingNote;
  const hasPlaceDetail = !!details.offlinePlaceDetail;
  const shouldShowToggle = hasMeetingNote || hasPlaceDetail;
  const hasPlaceName = !!(details.offlinePlaceName && details.offlinePlaceName.trim());

  const handleOpenCancelModal = () => {
    if (createdInfo?.eventId && onOpenCancelModal) {
      onOpenCancelModal(createdInfo.eventId);
      // 削除モーダルを開くが、完了モーダルは閉じない
    }
  };

  if (!createdInfo) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-2 sm:p-3 overflow-y-auto overscroll-none backdrop-blur-sm">
      <div className="w-full max-w-sm sm:max-w-md overflow-hidden rounded-2xl border border-white/20 bg-white/95 shadow-2xl max-h-[55vh] sm:max-h-[60vh] flex flex-col my-auto backdrop-blur">
        <div className="flex items-center gap-2 border-b border-white/20 bg-gradient-to-r from-emerald-500/90 to-teal-500/90 px-3 sm:px-4 py-2.5 sm:py-3 flex-shrink-0 backdrop-blur">
          <div className="text-base sm:text-lg">✅</div>
          <h3 className="text-sm sm:text-base font-semibold text-white drop-shadow">予定を作成しました！</h3>
        </div>
        <div className="p-3 sm:p-4 overflow-y-auto overscroll-contain flex-1 min-h-0">
          {createdInfo.ok ? (
            <div className="space-y-3 text-sm text-zinc-800">
              {/* 完了アニメーション */}
              <div className="mb-4 flex items-center justify-center">
                <CircleCheckLoader isComplete={true} size={80} />
              </div>
              <GlassCardSimple
                gradientFrom="from-emerald-400"
                gradientTo="to-green-500"
                iconColor="text-emerald-300"
                animationDelay={0}
                className="bg-white/10"
              >
                <p className="m-0 text-sm text-black/90">
                  ご入力いただいたメールアドレスに<br />
                  Googleカレンダーから予定の招待を送りました。<br />
                  お打ち合わせ当日はどうぞよろしくお願いします。<br />
                </p>
              </GlassCardSimple>
              {createdInfo.htmlLink && (
                <a
                  className="inline-flex items-center justify-center rounded-md bg-blue-600 px-3 py-2 sm:py-1.5 text-sm text-white hover:bg-blue-500 touch-manipulation w-full sm:w-auto"
                  href={createdInfo.htmlLink}
                  target="_blank"
                  rel="noreferrer"
                >
                  Googleカレンダーを開く
                </a>
              )}
              {createdInfo.eventId && (
                <div className="rounded-lg bg-blue-50 p-3 border border-blue-100">
                  <div className="flex flex-col gap-2">
                    <div className="text-xs font-medium text-blue-700">EventID</div>
                    <div className="rounded-md bg-white px-2.5 py-1.5 font-mono text-[11px] sm:text-[13px] text-zinc-800 break-all border border-blue-200">{createdInfo.eventId}</div>
                    <button
                      className="inline-flex items-center justify-center rounded-md border border-blue-300 bg-white px-3 py-2 text-xs text-blue-700 hover:bg-blue-50 flex-shrink-0 touch-manipulation font-medium"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(createdInfo.eventId as string);
                          setCopiedEventId(true);
                          setTimeout(() => setCopiedEventId(false), 1500);
                        } catch {}
                      }}
                    >
                      {copiedEventId ? "✓ コピー済み" : "📋 コピー"}
                    </button>
                    <p className="text-xs text-blue-600">お問い合わせの際はEventIDを記載の上お問い合わせください。</p>
                  </div>
                </div>
              )}
              {contactMethod === "meet" && createdInfo.meetLink && (
                <div className="rounded-lg bg-purple-50 p-3 border border-purple-100">
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-medium text-purple-700 flex-shrink-0">Google Meet URL</span>
                    <code className="break-all rounded-md bg-white px-2.5 py-1.5 text-[11px] sm:text-[12px] text-zinc-800 border border-purple-200">{createdInfo.meetLink}</code>
                    <button
                      className="inline-flex items-center justify-center rounded-md border border-purple-300 bg-white px-3 py-2 text-xs text-purple-700 hover:bg-purple-50 flex-shrink-0 touch-manipulation font-medium"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(createdInfo.meetLink as string);
                          setCopiedMeet(true);
                          setTimeout(() => setCopiedMeet(false), 1500);
                        } catch {}
                      }}
                    >
                      {copiedMeet ? "✓ コピー済み" : "📋 コピー"}
                    </button>
                    <p className="text-xs text-purple-600">当日はこちらのGoogle Meet URLからご参加ください。</p>
                  </div>
                </div>
              )}
              {/* 予約内容 */}
              <div className="mt-3 sm:mt-4">
                <div className="mb-2 text-xs font-semibold text-zinc-500">予約内容</div>
                <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                  <div className="rounded-lg bg-white border border-zinc-200 p-2 sm:p-3">
                    <div className="text-[11px] sm:text-xs text-zinc-500">日付</div>
                    <div className="mt-1 font-medium text-xs sm:text-sm">{calendarLoading ? "読み込み中..." : `${details.year ?? "XXXX"}/${padOrXX(details.month)}/${padOrXX(details.day)}(${details.weekday || "X"})`}</div>
                  </div>
                  <div className="rounded-lg bg-white border border-zinc-200 p-2 sm:p-3">
                    <div className="text-[11px] sm:text-xs text-zinc-500">時間</div>
                    <div className="mt-1 font-medium text-xs sm:text-sm">{calendarLoading ? "読み込み中..." : formatTimeRange(details.startHour, details.startMin, details.endHour, details.endMin)}</div>
                  </div>
                  <div className="rounded-lg bg-white border border-zinc-200 p-2 sm:p-3 col-span-2">
                    <div className="text-[11px] sm:text-xs text-zinc-500">お名前(本名)</div>
                    <div className="mt-1 font-medium text-xs sm:text-sm break-all">{details.name || "(未入力)"}</div>
                  </div>
                  <div className="rounded-lg bg-white border border-zinc-200 p-2 sm:p-3 col-span-2">
                  <div className="text-[11px] sm:text-xs text-zinc-500">ご相談内容</div>
                    <div className="mt-1 font-medium whitespace-pre-wrap break-all text-xs sm:text-[13px] leading-relaxed text-zinc-800">{PURPOSES.find((p) => p.value === details.purpose)?.label || details.purpose}</div>
                  </div>
                  <div className="rounded-lg bg-white border border-zinc-200 p-2 sm:p-3 col-span-2">
                    <div className="text-[11px] sm:text-xs text-zinc-500">ミーティング媒体</div>
                    <div className="mt-1 font-medium text-xs sm:text-sm flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
                      <span>{contactMethod === "meet" ? "GoogleMeet" : contactMethod === "offline" ? "オフライン" : contactMethod}</span>
                      {contactMethod === "discord" && (
                        <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] sm:text-xs text-indigo-700 w-fit">Discord名: {details.discordName || "(未入力)"}</span>
                      )}
                      {contactMethod === "slack" && (
                        <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] sm:text-xs text-indigo-700 w-fit">Slack名: {details.slackName || "(未入力)"}</span>
                      )}
                      {contactMethod === "other" && details.otherNote && (
                        <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] sm:text-xs text-indigo-700 w-fit break-all">備考: {details.otherNote}</span>
                      )}
                      {contactMethod === "offline" && (
                        <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] sm:text-xs text-indigo-700 w-fit">オフライン</span>
                      )}
                    </div>
                  </div>
                  <div className="rounded-lg bg-white border border-zinc-200 p-2 sm:p-3 col-span-2">
                    <div className="text-[11px] sm:text-xs text-zinc-500">メール</div>
                    <div className="mt-1 font-medium text-xs sm:text-sm break-all">{details.email || "(メール未入力)"}</div>
                  </div>
                  {shouldShowToggle && !hasPlaceName && (
                    <div className="col-span-2">
                      <button
                        type="button"
                        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 touch-manipulation"
                        onClick={() => setShowDetail((v) => !v)}
                      >
                        {showDetail ? "ご相談詳細を隠す" : "ご相談詳細を表示"}
                      </button>
                    </div>
                  )}
                  {contactMethod === "offline" && (
                    <>
                      <div className="rounded-lg bg-white border border-zinc-200 p-2 sm:p-3 col-span-2">
                        <div className="text-[11px] sm:text-xs text-zinc-500">場所の名称(自動入力)</div>
                        <div className="mt-1 font-medium text-xs sm:text-sm break-all">{details.offlinePlaceName ?? "(取得できませんでした)"}</div>
                      </div>
                      {hasPlaceName && shouldShowToggle && (
                        <div className="col-span-2">
                          <button
                            type="button"
                            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 touch-manipulation"
                            onClick={() => setShowDetail((v) => !v)}
                          >
                            {showDetail ? "ご相談詳細を隠す" : "ご相談詳細を表示"}
                          </button>
                        </div>
                      )}
                      {showDetail && details.offlinePlaceDetail ? (
                        <div className="rounded-lg bg-white border border-zinc-200 p-2 sm:p-3 col-span-2">
                          <div className="text-[11px] sm:text-xs text-zinc-500">場所の詳細</div>
                          <div className="mt-1 whitespace-pre-wrap text-xs sm:text-[13px] leading-relaxed text-zinc-800 break-all">{details.offlinePlaceDetail}</div>
                        </div>
                      ) : null}
                    </>
                  )}
                  {showDetail && details.meetingNote && (
                    <div className="rounded-lg bg-white border border-zinc-200 p-2 sm:p-3 col-span-2">
                      <div className="text-[11px] sm:text-xs text-zinc-500">ご相談詳細(任意)</div>
                      <div className="mt-1 whitespace-pre-wrap text-xs sm:text-[13px] leading-relaxed text-zinc-800 max-h-12 overflow-y-auto pr-1 break-all">{details.meetingNote}</div>
                    </div>
                  )}
                </div>
              </div>
              {/* ご案内 */}
              <GlassCardSimple
                gradientFrom="from-yellow-400"
                gradientTo="to-amber-500"
                iconColor="text-yellow-300"
                animationDelay={0}
                className="bg-white/10 mt-3 sm:mt-4"
              >
                <p className="m-0 text-xs text-black/90">
                  こちらの都合で取り消しさせていただく場合があります。<br />
                  その際はメール・Discord・Slackなどでお知らせします。
                </p>
              </GlassCardSimple>
              <GlassCardSimple
                gradientFrom="from-yellow-400"
                gradientTo="to-amber-500"
                iconColor="text-yellow-300"
                animationDelay={0}
                className="bg-white/10 mt-2"
              >
                <p className="m-0 text-xs text-black/90">
                  予定の取り消しをご希望の場合は、<br />
                  <a className="underline break-all" href="/reserve">Ask Meページ</a>から予定を取り消してください。
                </p>
              </GlassCardSimple>
              <GlassCardSimple
                gradientFrom="from-yellow-400"
                gradientTo="to-amber-500"
                iconColor="text-yellow-300"
                animationDelay={0}
                className="bg-white/10 mt-2"
              >
                <p className="m-0 text-xs text-black/90">
                  予定の変更をご希望の場合は、<br />
                  <a className="underline break-all" href="/contact">Contact</a>ページまたは<br />
                  Discord・Slackでご連絡ください。<br />
                </p>
              </GlassCardSimple>
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <p className="text-red-600">作成に失敗しました。</p>
              {createdInfo.message && (
                <p className="text-zinc-700">{createdInfo.message}</p>
              )}
              {createdInfo.error && (
                <p className="font-mono text-xs text-zinc-500 break-all">error: {createdInfo.error}</p>
              )}
              {createdInfo.detail && (
                <pre className="overflow-x-auto rounded-md bg-zinc-100 p-3 text-xs text-zinc-700 whitespace-pre-wrap break-all">
                  {typeof createdInfo.detail === "string" ? createdInfo.detail : JSON.stringify(createdInfo.detail, null, 2)}
                </pre>
              )}
            </div>
          )}
          <div className="mt-4 sm:mt-5 flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 justify-end">
            {createdInfo.ok && createdInfo.eventId && onOpenCancelModal && (
              <button
                className="rounded-md border border-red-300 bg-white px-4 py-2.5 sm:py-2 text-sm text-red-600 hover:bg-red-50 touch-manipulation min-h-[44px] sm:min-h-0"
                onClick={handleOpenCancelModal}
              >
                予定を取り消す
              </button>
            )}
            <button
              className="rounded-md bg-zinc-900 px-4 py-2.5 sm:py-2 text-sm text-white hover:bg-zinc-800 touch-manipulation min-h-[44px] sm:min-h-0"
              onClick={onClose}
            >
              閉じる
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

