"use client";

import React from "react";
import { NotebookText } from "lucide-react";

export function ConfirmModal({
  onClose,
  onSubmit,
  details,
}: {
  onClose: () => void;
  onSubmit: () => void;
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
    contactMethod: "meet" | "discord" | "slack" | "other" | "";
    discordName: string;
    slackName: string;
    otherNote: string;
    email: string;
    meetingNote?: string;
  };
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-3 overflow-y-auto">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl max-h-[85vh]">
        <div className="flex items-center gap-2 border-b border-zinc-200 bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-3">
          <NotebookText className="h-5 w-5 text-white" aria-hidden="true" />
          <h3 className="text-base font-semibold text-white">最終確認</h3>
        </div>
        <div className="p-5 overflow-y-auto">
          <div className="grid gap-3 text-sm text-zinc-900 sm:grid-cols-2">
            <div className="rounded-lg bg-zinc-50 p-3">
              <div className="text-xs text-zinc-500">日付</div>
              <div className="mt-1 font-medium">{`${details.year ?? "XXXX"}年${padOrXX(details.month)}月${padOrXX(details.day)}日(${details.weekday || "X"})`}</div>
            </div>
            <div className="rounded-lg bg-zinc-50 p-3">
              <div className="text-xs text-zinc-500">時間</div>
              <div className="mt-1 font-medium">{formatTimeRange(details.startHour, details.startMin, details.endHour, details.endMin)}</div>
            </div>
            <div className="rounded-lg bg-zinc-50 p-3">
              <div className="text-xs text-zinc-500">お名前(本名)</div>
              <div className="mt-1 font-medium">{details.name || "(未入力)"}</div>
            </div>
            <div className="rounded-lg bg-zinc-50 p-3">
              <div className="text-xs text-zinc-500">ご相談内容</div>
              <div className="mt-1 font-medium">{details.purpose}</div>
            </div>
            <div className="rounded-lg bg-zinc-50 p-3 sm:col-span-2">
              <div className="text-xs text-zinc-500">ご連絡手段（ミーティング媒体）</div>
              <div className="mt-1 font-medium">
                {details.contactMethod === "meet" ? "GoogleMeet" : details.contactMethod}
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
            <div className="rounded-lg bg-zinc-50 p-3 sm:col-span-2">
              <div className="text-xs text-zinc-500">メール</div>
              <div className="mt-1 font-medium">{details.email || "(メール未入力)"}</div>
            </div>
            {details.meetingNote && (
              <div className="rounded-lg bg-zinc-50 p-3 sm:col-span-2">
                <div className="text-xs text-zinc-500">ご相談詳細</div>
                <div className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-800">{details.meetingNote}</div>
              </div>
            )}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 hover:bg-zinc-50" onClick={onClose}>
              キャンセル
            </button>
            <button className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500" onClick={onSubmit}>
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


