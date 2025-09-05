"use client";

import React from "react";

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
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700">メールアドレス</h2>
          <input
            className="w-full rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 placeholder-zinc-400"
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

      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:col-span-2">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">ご連絡手段（ミーティング媒体）</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <select
            className="rounded-md border border-zinc-300 bg-white p-2 text-zinc-900"
            value={contactMethod || ""}
            onChange={(e) => setContactMethod(e.target.value as ContactMethod)}
          >
            <option value="" disabled>---選択してください---</option>
            <option value="meet">Google Meet</option>
            <option value="discord">Discord</option>
            <option value="slack">Slack</option>
            <option value="other">その他 (Zoom等)</option>
          </select>
          {errors.contactMethod && <span className="text-xs text-red-600">{errors.contactMethod}</span>}

          {contactMethod === "discord" && (
            <>
              <div className="flex flex-col">
                <span className="mb-1 text-xs text-zinc-600">Discordサーバー名</span>
                <input
                  className="rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 placeholder-zinc-400"
                  placeholder="Discordサーバー名"
                  value={discordServer}
                  onChange={(e) => setDiscordServer(e.target.value)}
                  onFocus={onDiscordServerFocus}
                />
                {(!discordServer || !discordServer.trim()) && <span className="mt-1 text-xs text-red-600">入力必須です</span>}
              </div>
              <div className="flex flex-col">
                <span className="mb-1 text-xs text-zinc-600">Discord表示名</span>
                <input
                  className="rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 placeholder-zinc-400"
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
                <span className="mb-1 text-xs text-zinc-600">Slackワークスペース名</span>
                <input
                  className="rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 placeholder-zinc-400"
                  placeholder="面談するSlackワークスペース名"
                  value={slackWorkspace}
                  onChange={(e) => setSlackWorkspace(e.target.value)}
                />
                {(!slackWorkspace || !slackWorkspace.trim()) && <span className="mt-1 text-xs text-red-600">入力必須です</span>}
              </div>
              <div className="flex flex-col">
                <span className="mb-1 text-xs text-zinc-600">Slack表示名</span>
                <input
                  className="rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 placeholder-zinc-400"
                  placeholder="Slack表示名"
                  value={slackName}
                  onChange={(e) => setSlackName(e.target.value)}
                />
                {(!slackName || !slackName.trim()) && <span className="mt-1 text-xs text-red-600">入力必須です</span>}
              </div>
            </>
          )}

          {contactMethod === "other" && (
            <input
              className="rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 placeholder-zinc-400"
              placeholder="備考（任意：Zoomリンク等）"
              value={otherNote}
              onChange={(e) => setOtherNote(e.target.value)}
            />
          )}
        </div>
      </div>
    </>
  );
}


