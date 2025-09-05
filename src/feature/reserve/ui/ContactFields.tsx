"use client";

import React from "react";
import { Mails, MessageSquare, HashIcon, Slack, Link as LinkIcon } from "lucide-react";

type ContactMethod = "" | "meet" | "discord" | "slack" | "other";

export function ContactFields({
  contactMethod,
  setContactMethod,
  email,
  setEmail,
  discordServer,
  setDiscordServer,
  onDiscordServerFocus,
  discordName,
  setDiscordName,
  slackWorkspace,
  setSlackWorkspace,
  slackName,
  setSlackName,
  otherNote,
  setOtherNote,
  errors,
  renderEmail = true,
}: {
  contactMethod: ContactMethod;
  setContactMethod: (v: ContactMethod) => void;
  email: string;
  setEmail: (v: string) => void;
  discordServer: string;
  setDiscordServer: (v: string) => void;
  onDiscordServerFocus?: () => void;
  discordName: string;
  setDiscordName: (v: string) => void;
  slackWorkspace: string;
  setSlackWorkspace: (v: string) => void;
  slackName: string;
  setSlackName: (v: string) => void;
  otherNote: string;
  setOtherNote: (v: string) => void;
  errors: Record<string, string>;
  renderEmail?: boolean;
}) {
  const emailTrim = (email || "").trim();
  const emailBlank = emailTrim.length === 0;
  const emailRegexOk = /^\S+@\S+\.[\w\-]+$/.test(emailTrim);
  const emailFormatError = !!errors.email && errors.email !== "入力必須です";
  return (
    <>
      {renderEmail && (
        <div className="rounded-2xl border border-white/20 bg-white/90 p-6 shadow-lg backdrop-blur sm:col-span-2">
          <h2 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-zinc-700"><Mails className="h-4 w-4 text-zinc-500" /> メールアドレス</h2>
          <input
            className="w-full rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 placeholder-zinc-400 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            type="email"
            placeholder="your.name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {emailBlank && <p className="mt-1 text-xs text-red-600">入力必須です</p>}
          {!emailBlank && !emailRegexOk && (
            <p className="mt-1 text-xs text-red-600">正しいメールアドレスを入力してください</p>
          )}
          {!emailBlank && emailRegexOk && emailFormatError && (
            <p className="mt-1 text-xs text-red-600">{errors.email}</p>
          )}
          <p className="mt-1 text-xs text-zinc-500">
            入力いただいたメールアドレス宛に Google カレンダーから予定招待が届きます。連絡可能なメールアドレスをご入力ください。
            こちらの都合で予定をキャンセル・変更のご提案をさせていただく場合があります。
          </p>
        </div>
      )}

      <div className="rounded-2xl border border-white/20 bg-white/90 p-6 shadow-lg backdrop-blur sm:col-span-2">
        <h2 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-zinc-700"><MessageSquare className="h-4 w-4 text-zinc-500" /> ご連絡手段（ミーティング媒体）</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <select
            className="rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            value={contactMethod || ""}
            onChange={(e) => setContactMethod(e.target.value as ContactMethod)}
          >
            <option value="" disabled>---選択してください---</option>
            <option value="meet">GoogleMeet</option>
            <option value="discord">Discord</option>
            <option value="slack">Slack</option>
            <option value="other">その他 (Zoom等)</option>
          </select>
          {errors.contactMethod && <span className="text-xs text-red-600">{errors.contactMethod}</span>}

          {contactMethod === "discord" && (
            <>
              <div className="flex flex-col">
                <span className="mb-1 inline-flex items-center gap-1 text-xs text-zinc-600"><HashIcon className="h-3 w-3" /> Discordサーバー名</span>
                <input
                  className="rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 placeholder-zinc-400 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="Discordサーバー名"
                  value={discordServer}
                  onChange={(e) => setDiscordServer(e.target.value)}
                  onFocus={onDiscordServerFocus}
                />
                {(!discordServer || !discordServer.trim()) && <span className="mt-1 text-xs text-red-600">入力必須です</span>}
              </div>
              <div className="flex flex-col">
                <span className="mb-1 inline-flex items-center gap-1 text-xs text-zinc-600"><HashIcon className="h-3 w-3" /> Discord表示名</span>
                <input
                  className="rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 placeholder-zinc-400 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="Discord表示名"
                  value={discordName}
                  onChange={(e) => setDiscordName(e.target.value)}
                />
                {(!discordName || !discordName.trim()) && <span className="mt-1 text-xs text-red-600">入力必須です</span>}
              </div>
            </>
          )}

          {contactMethod === "slack" && (
            <>
              <div className="flex flex-col">
                <span className="mb-1 inline-flex items-center gap-1 text-xs text-zinc-600"><Slack className="h-3 w-3" /> Slackワークスペース名</span>
                <input
                  className="rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 placeholder-zinc-400 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="面談するSlackワークスペース名"
                  value={slackWorkspace}
                  onChange={(e) => setSlackWorkspace(e.target.value)}
                />
                {(!slackWorkspace || !slackWorkspace.trim()) && <span className="mt-1 text-xs text-red-600">入力必須です</span>}
              </div>
              <div className="flex flex-col">
                <span className="mb-1 inline-flex items-center gap-1 text-xs text-zinc-600"><Slack className="h-3 w-3" /> Slack表示名</span>
                <input
                  className="rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 placeholder-zinc-400 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="Slack表示名"
                  value={slackName}
                  onChange={(e) => setSlackName(e.target.value)}
                />
                {(!slackName || !slackName.trim()) && <span className="mt-1 text-xs text-red-600">入力必須です</span>}
              </div>
            </>
          )}

          {contactMethod === "other" && (
            <div className="flex flex-col">
              <span className="mb-1 inline-flex items-center gap-1 text-xs text-zinc-600"><LinkIcon className="h-3 w-3" /> 備考・リンク</span>
              <input
                className="rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 placeholder-zinc-400 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                placeholder="備考（任意：Zoomリンク等）"
                value={otherNote}
                onChange={(e) => setOtherNote(e.target.value)}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}


