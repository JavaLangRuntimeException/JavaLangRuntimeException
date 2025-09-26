"use client";

import React from "react";
import { PURPOSES } from "../../../shared/config/purposes";
import { useBodyScrollLock } from "../../../shared/lib/useBodyScrollLock";

export type CreatedInfo = { ok: boolean; eventId?: string; htmlLink?: string; meetLink?: string } | null;

export function CompletionModal({
  createdInfo,
  contactMethod,
  details,
  onClose,
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
  calendarLoading?: boolean;
}) {
  const [copiedMeet, setCopiedMeet] = React.useState(false);
  useBodyScrollLock(!!createdInfo);
  const [showDetail, setShowDetail] = React.useState(false);
  const hasMeetingNote = !!details.meetingNote;
  const hasPlaceDetail = !!details.offlinePlaceDetail;
  const shouldShowToggle = hasMeetingNote || hasPlaceDetail;
  const hasPlaceName = !!(details.offlinePlaceName && details.offlinePlaceName.trim());

  if (!createdInfo) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-3 overflow-y-auto overscroll-none">
      <div className="w-full max-w-lg sm:max-w-xl md:max-w-2xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl max-h-[85vh]">
        <div className="flex items-center gap-2 border-b border-zinc-200 bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-3">
          <div className="text-lg">✅</div>
          <h3 className="text-base font-semibold text-white">予定を作成しました！</h3>
        </div>
        <div className="p-5 overflow-y-auto overscroll-contain">
          {createdInfo.ok ? (
            <div className="space-y-3 text-sm text-zinc-800">
              <div className="rounded-lg bg-emerald-50 p-3 text-[13px] leading-relaxed text-emerald-900">
                ご入力いただいたメールアドレスにGoogleカレンダーから予定の招待を送りました。<br />
                お打ち合わせ当日はどうぞよろしくお願いします。<br />
              </div>
              {createdInfo.eventId && (
                <div>
                  <div className="text-xs text-zinc-500">EventID</div>
                  <div className="mt-1 inline-flex items-center rounded-md bg-zinc-100 px-2 py-1 font-mono text-[13px] text-zinc-800">{createdInfo.eventId}</div>
                  <p className="mt-1 text-xs text-zinc-600">お問い合わせの際はこちらのEventIDを記載の上お問い合わせください。</p>
                </div>
              )}
              <div className="flex flex-wrap gap-3">
                {createdInfo.htmlLink && (
                  <a
                    className="inline-flex items-center justify-center rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500"
                    href={createdInfo.htmlLink}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Googleカレンダーを開く
                  </a>
                )}
                {contactMethod === "meet" && createdInfo.meetLink && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">Meet URL</span>
                    <code className="max-w-[420px] break-all rounded bg-zinc-100 px-2 py-1 text-[12px] text-zinc-800">{createdInfo.meetLink}</code>
                    <button
                      className="inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 hover:bg-zinc-50"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(createdInfo.meetLink as string);
                          setCopiedMeet(true);
                          setTimeout(() => setCopiedMeet(false), 1500);
                        } catch {}
                      }}
                    >
                      {copiedMeet ? "コピー済み" : "コピー"}
                    </button>
                  </div>
                )}
              </div>
              {/* 予約内容 */}
              <div className="mt-4">
                <div className="mb-2 text-xs font-semibold text-zinc-500">予約内容</div>
                <div className="grid grid-cols-2 gap-2">
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
                  <div className="rounded-lg bg-zinc-50 p-3">
                  <div className="text-xs text-zinc-500">ご相談内容</div>
                  <div className="mt-1 font-medium">{PURPOSES.find((p) => p.value === details.purpose)?.label || details.purpose}</div>
                  </div>
                  <div className="rounded-lg bg-zinc-50 p-3 col-span-2">
                    <div className="text-xs text-zinc-500">ミーティング媒体</div>
                    <div className="mt-1 font-medium">
                      {contactMethod === "meet" ? "GoogleMeet" : contactMethod === "offline" ? "オフライン" : contactMethod}
                      {contactMethod === "discord" && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-700">Discord名: {details.discordName || "(未入力)"}</span>
                      )}
                      {contactMethod === "slack" && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-700">Slack名: {details.slackName || "(未入力)"}</span>
                      )}
                      {contactMethod === "other" && details.otherNote && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-700">備考: {details.otherNote}</span>
                      )}
                      {contactMethod === "offline" && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-700">オフライン</span>
                      )}
                    </div>
                  </div>
                  <div className="rounded-lg bg-zinc-50 p-3 col-span-2">
                    <div className="text-xs text-zinc-500">メール</div>
                    <div className="mt-1 font-medium">{details.email || "(メール未入力)"}</div>
                  </div>
                  {shouldShowToggle && !hasPlaceName && (
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
                  {contactMethod === "offline" && (
                    <>
                      <div className="rounded-lg bg-zinc-50 p-3 col-span-2">
                        <div className="text-xs text-zinc-500">場所の名称(自動入力)</div>
                        <div className="mt-1 font-medium">{details.offlinePlaceName ?? "(取得できませんでした)"}</div>
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
                      {showDetail && details.offlinePlaceDetail ? (
                        <div className="rounded-lg bg-zinc-50 p-3 col-span-2">
                          <div className="text-xs text-zinc-500">場所の詳細</div>
                          <div className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-800">{details.offlinePlaceDetail}</div>
                        </div>
                      ) : null}
                    </>
                  )}
                  {showDetail && details.meetingNote && (
                    <div className="rounded-lg bg-zinc-50 p-3 col-span-2">
                      <div className="text-xs text-zinc-500">ご相談詳細(任意)</div>
                      <div className="mt-1 whitespace-pre text-[13px] leading-relaxed text-zinc-800 h-24 w-[20ch] overflow-auto pr-1">{details.meetingNote}</div>
                    </div>
                  )}
                </div>
              </div>
              {/* ご案内 */}
              <div className="mt-4 rounded-lg bg-amber-50 p-3 text-[13px] leading-relaxed text-amber-900">
                <p>・こちらの都合で取り消しさせていただく場合があります。その際はメールなどでお知らせします。</p>
                <p className="mt-1">・予約の取り消しや変更をご希望の場合は、メール（<a className="underline" href="mailto:tanahashishuta@gmail.com">tanahashishuta@gmail.com</a>）またはDiscord・Slackでご連絡ください。</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-red-600">作成に失敗しました。</p>
          )}
          <div className="mt-5 flex justify-end">
            <button className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800" onClick={onClose}>
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


