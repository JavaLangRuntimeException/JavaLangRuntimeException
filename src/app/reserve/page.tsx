"use client";

import React from "react";
import { motion } from "framer-motion";

type Purpose = "TechSelect+" | "STECH" | "RM2C" | "JINEN" | "NxTEND" | "RCC" | "その他";

export default function ReservePage() {
  const now = React.useMemo(() => new Date(), []);
  const currentMonday = getMonday(now);
  const [weekStart, setWeekStart] = React.useState<Date>(currentMonday);
  const oneMonthLater = React.useMemo(() => {
    const d = new Date(now);
    d.setMonth(d.getMonth() + 1);
    return d;
  }, [now]);
  const [year, setYear] = React.useState<number | null>(null);
  const [month, setMonth] = React.useState<number | null>(null);
  const [day, setDay] = React.useState<number | null>(null);
  const [weekday, setWeekday] = React.useState("");
  const [startHour, setStartHour] = React.useState<number | null>(null);
  const [startMin, setStartMin] = React.useState<number | null>(null);
  const [endHour, setEndHour] = React.useState<number | null>(null);
  const [endMin, setEndMin] = React.useState<number | null>(null);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [emailError, setEmailError] = React.useState<string>("");
  const [purpose, setPurpose] = React.useState<Purpose>("TechSelect+");
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [createdInfo, setCreatedInfo] = React.useState<{ ok: boolean; eventId?: string; htmlLink?: string; meetLink?: string } | null>(null);
  const [copiedMeet, setCopiedMeet] = React.useState(false);

  const [contactMethod, setContactMethod] = React.useState<"meet" | "discord" | "slack" | "other">("meet");
  const [discordName, setDiscordName] = React.useState("");
  const [slackName, setSlackName] = React.useState("");
  const [otherNote, setOtherNote] = React.useState("");
  const [meetingNote, setMeetingNote] = React.useState("");
  const [busy, setBusy] = React.useState<{ start: string; end: string }[]>([]);
  // current selected range (driven by inputs)
  const hasDate = year != null && month != null && day != null;
  const hasTime = startHour != null && startMin != null && endHour != null && endMin != null;
  const selectedStart = hasDate && hasTime
    ? new Date(year as number, (month as number) - 1, day as number, startHour as number, startMin as number, 0, 0)
    : new Date(0);
  const selectedEnd = hasDate && hasTime
    ? new Date(year as number, (month as number) - 1, day as number, endHour as number, endMin as number, 0, 0)
    : new Date(0);

  // 選択中の時間帯が無効かどうか（過去/リードタイム/1ヶ月先/Busy重複）
  const selectionInvalid = React.useMemo(() => {
    if (!hasDate || !hasTime) return false;
    const s = new Date(year as number, (month as number) - 1, day as number, startHour as number, startMin as number);
    const e = new Date(year as number, (month as number) - 1, day as number, endHour as number, endMin as number);
    const nowTs = Date.now();
    const leadCutoff = nowTs + 2 * 60 * 60 * 1000;
    if (!(e > s)) return true;
    if (s.getTime() <= nowTs) return true;
    if (s.getTime() < leadCutoff) return true;
    if (s.getTime() > oneMonthLater.getTime()) return true;
    if (isOverlappingBusy(s, e, busy)) return true;
    return false;
  }, [hasDate, hasTime, year, month, day, startHour, startMin, endHour, endMin, busy, oneMonthLater]);

  // fetch busy intervals for current week (Mon-Sun)
  React.useEffect(() => {
    fetch("/api/ical/busy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekStartISO: weekStart.toISOString() }),
    })
      .then((r) => r.json())
      .then((d) => setBusy(d.busy || []))
      .catch(() => setBusy([]));
  }, [weekStart]);

  React.useEffect(() => {
    if (hasDate) setWeekday(weekdayName(new Date(year as number, (month as number) - 1, day as number)));
    else setWeekday("");
  }, [hasDate, year, month, day]);

  const hours = React.useMemo(() => Array.from({ length: 16 }, (_, i) => 9 + i), []); // 9-24
  const minuteOptions = React.useMemo(() => [0, 30], []);
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
  const yearOptions = React.useMemo(() => (currentMonth === 12 ? [currentYear, currentYear + 1] : [currentYear]), [currentYear, currentMonth]);
  const monthOptions = React.useMemo(() => {
    if (year == null) return [] as number[];
    if (year === currentYear) {
      return currentMonth === 12 ? [12] : [currentMonth, nextMonth];
    }
    if (currentMonth === 12 && year === currentYear + 1) return [1];
    return [] as number[];
  }, [year, currentYear, currentMonth, nextMonth]);
  React.useEffect(() => {
    if (year == null) return;
    if (month == null || !monthOptions.includes(month)) {
      setMonth(monthOptions[0] ?? null);
    }
  }, [year, month, monthOptions]);

  async function handleSubmit() {
    // validation: start < end
    if (!hasDate || !hasTime) {
      alert("日付と時間を選択してください");
      return;
    }
    // 過去は不可
    const nowTs = Date.now();
    // 2時間以内は不可
    const minStartTs = nowTs + 2 * 60 * 60 * 1000;
    if (!isValidEmail(email)) {
      alert("正しいメールアドレスを入力してください");
      return;
    }
    if (contactMethod === "discord" && !discordName.trim()) {
      alert("Discord名は必須です");
      return;
    }
    if (contactMethod === "slack" && !slackName.trim()) {
      alert("Slack名は必須です");
      return;
    }
    const startDate = new Date(year as number, (month as number) - 1, day as number, startHour as number, startMin as number);
    const endDate = new Date(year as number, (month as number) - 1, day as number, endHour as number, endMin as number);
    if (startDate.getTime() <= nowTs) {
      alert("過去の時間は選択できません");
      return;
    }
    if (startDate.getTime() < minStartTs) {
      alert("現在時刻から2時間後以降のみ予約できます");
      return;
    }
    if (!(endDate > startDate)) {
      alert("終了は開始より後にしてください");
      return;
    }
    if (isOverlappingBusy(startDate, endDate, busy)) {
      alert("選択した時間帯は不可です");
      return;
    }
    setConfirmOpen(false);
    setCreating(true);
    const payload = {
      year,
      month,
      day,
      weekday,
      start: { hour: startHour, minute: startMin },
      end: { hour: endHour, minute: endMin },
      name,
      email,
      purpose,
      contactMethod,
      discordName: contactMethod === "discord" ? discordName.trim() : undefined,
      slackName: contactMethod === "slack" ? slackName.trim() : undefined,
      otherNote: contactMethod === "other" ? otherNote.trim() : undefined,
      meetingNote: meetingNote.trim() || undefined,
    };
    try {
      const res = await fetch("/api/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      setCreatedInfo({ ok: !!json?.ok, eventId: json?.eventId, htmlLink: json?.htmlLink, meetLink: json?.meetLink });
    } catch {
      setCreatedInfo({ ok: false });
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 text-zinc-900">
      <motion.h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        お打ち合わせ予約
      </motion.h1>
      <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
        お問い合わせはメール(<a className="underline" href="mailto:tanahashishuta@gmail.com">tanahashishuta@gmail.com</a>)またはX(<a className="underline" href="https://x.com/JavaLangRuntime" target="_blank" rel="noreferrer">@JavaLangRuntime</a>)でも承っております
      </p>




      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700">打ち合わせ内容</h2>
          <textarea
            className="w-full rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 placeholder-zinc-400 min-h-[120px]"
            placeholder="当日話したい内容や事前共有事項があればご記入ください"
            value={meetingNote}
            onChange={(e) => setMeetingNote(e.target.value)}
          />
          <p className="mt-1 text-xs text-zinc-500">Googleカレンダーの予定の詳細に記載されます（任意）。</p>
        </div>
      </section>

      {/* 目的/名前/ご連絡手段 */}
      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700">目的</h2>
          <select className="w-full rounded-md border border-zinc-300 bg-white p-2 text-zinc-900" value={purpose} onChange={(e) => setPurpose(e.target.value as Purpose)}>
            <option value="TechSelect+">TechSelect+</option>
            <option value="STECH">STECH</option>
            <option value="RM2C">RM2C</option>
            <option value="JINEN">JINEN</option>
            <option value="NxTEND">NxTEND</option>
            <option value="RCC">RCC</option>
            <option value="その他">その他</option>
          </select>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700">名前</h2>
          <input className="w-full rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 placeholder-zinc-400" placeholder="お名前" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700">メールアドレス</h2>
          <input
            className="w-full rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 placeholder-zinc-400"
            type="email"
            placeholder="your.name@example.com"
            value={email}
            onChange={(e) => {
              const v = e.target.value;
              setEmail(v);
              setEmailError(v && !isValidEmail(v) ? "正しいメールアドレスを入力してください" : "");
            }}
            pattern="^[^\s@]+@[^\s@]+\.[^\s@]+$"
          />
          {emailError && <p className="mt-1 text-xs text-red-600">{emailError}</p>}
          {!emailError && <p className="mt-1 text-xs text-zinc-500">招待メールを送信できるアドレスをご入力ください。</p>}
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700">ご連絡手段</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <select className="rounded-md border border-zinc-300 bg-white p-2 text-zinc-900" value={contactMethod} onChange={(e) => setContactMethod(e.target.value as "meet" | "discord" | "slack" | "other")}>
              <option value="meet">Google Meet</option>
              <option value="discord">Discord</option>
              <option value="slack">Slack</option>
              <option value="other">その他 (Zoom等)</option>
            </select>
            {contactMethod === "discord" && (
              <input className="rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 placeholder-zinc-400" placeholder="Discord名（必須）" value={discordName} onChange={(e) => setDiscordName(e.target.value)} />
            )}
            {contactMethod === "slack" && (
              <input className="rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 placeholder-zinc-400" placeholder="Slack名（必須）" value={slackName} onChange={(e) => setSlackName(e.target.value)} />
            )}
            {contactMethod === "other" && (
              <input className="rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 placeholder-zinc-400" placeholder="備考（任意：Zoomリンク等）" value={otherNote} onChange={(e) => setOtherNote(e.target.value)} />
            )}
          </div>
        </div>
      </section>

      {/* 日付と時間（ご連絡手段の下） */}
      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700">日付</h2>
          <div className="grid grid-cols-4 gap-3">
            <UnderLabelSelect value={year} setValue={setYear} options={yearOptions} underLabel="年" />
            <UnderLabelSelect value={month} setValue={setMonth} options={monthOptions} underLabel="月" />
            <UnderLabelSelect value={day} setValue={setDay} options={range(1, 31)} underLabel="日" />
            <div className="flex flex-col items-center justify-center">
              <div className="text-base font-semibold text-zinc-900">{weekday || "X"}</div>
              <div className="text-xs text-zinc-500">曜日</div>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700">時間</h2>
          <div className="flex flex-wrap items-end gap-3 text-zinc-900">
            <UnderLabelSelect value={startHour} setValue={setStartHour} options={hours} underLabel="時" />
            <div className="pb-4 text-lg text-zinc-500">:</div>
            <UnderLabelSelect value={startMin} setValue={setStartMin} options={minuteOptions} underLabel="分" />
            <div className="pb-4 text-lg text-zinc-400">~</div>
            <UnderLabelSelect value={endHour} setValue={setEndHour} options={hours} underLabel="時" />
            <div className="pb-4 text-lg text-zinc-500">:</div>
            <UnderLabelSelect value={endMin} setValue={setEndMin} options={minuteOptions} underLabel="分" />
          </div>
          <p className="mt-2 text-xs text-zinc-500">予約可能時間: 1ヶ月後までの月曜〜日曜 9:00 - 24:00</p>
          {hasDate && hasTime && selectionInvalid && (
            <p className="mt-2 text-xs text-red-600">ご指定の時間では予約できません</p>
          )}
        </div>
      </section>

      {/* 決定ボタン（カレンダーの上） */}
      <div className="mt-6 flex items-center gap-3">
        <button className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500" onClick={() => setConfirmOpen(true)}>
          決定
        </button>
      </div>

      {/* 週カレンダー（灰色でbusy埋め） */}
      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-700">カレンダー</h2>
          <div className="flex items-center gap-2">
            <button
              className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 disabled:opacity-50"
              onClick={() => setWeekStart(new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000))}
              disabled={weekStart.getTime() <= currentMonday.getTime()}
            >
              ← 前の週
            </button>
            <div className="text-xs text-zinc-600">
              {`${weekStart.getMonth() + 1}/${weekStart.getDate()}(${weekdayName(weekStart)})`} 〜 {`${new Date(weekStart.getTime() + 6 * 86400000).getMonth() + 1}/${new Date(weekStart.getTime() + 6 * 86400000).getDate()}(${weekdayName(new Date(weekStart.getTime() + 6 * 86400000))})`}
            </div>
            <button
              className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 disabled:opacity-50"
              onClick={() => setWeekStart(new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000))}
              disabled={new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000) > oneMonthLater}
            >
              次の週 →
            </button>
          </div>
        </div>
        <WeekGrid
          busy={busy}
          focusDate={weekStart}
          selectedStart={selectedStart}
          selectedEnd={selectedEnd}
          onSelectSlot={(slotStart: Date, slotEnd: Date) => {
            // If different date, switch date first
            setYear(slotStart.getFullYear());
            setMonth(slotStart.getMonth() + 1);
            setDay(slotStart.getDate());

            // If there is a current selection and the new slot is adjacent, extend it
            if (hasDate && hasTime) {
              const curStart = new Date(year as number, (month as number) - 1, day as number, startHour as number, startMin as number, 0, 0);
              const curEnd = new Date(year as number, (month as number) - 1, day as number, endHour as number, endMin as number, 0, 0);
              const isSameDay =
                curStart.getFullYear() === slotStart.getFullYear() &&
                curStart.getMonth() === slotStart.getMonth() &&
                curStart.getDate() === slotStart.getDate();
              if (isSameDay && curEnd > curStart) {
                const adjacentToEnd = Math.abs(slotStart.getTime() - curEnd.getTime()) === 0;
                const adjacentToStart = Math.abs(slotEnd.getTime() - curStart.getTime()) === 0;
                if (adjacentToEnd) {
                  setEndHour(slotEnd.getHours());
                  setEndMin(slotEnd.getMinutes());
                  return;
                }
                if (adjacentToStart) {
                  setStartHour(slotStart.getHours());
                  setStartMin(slotStart.getMinutes());
                  return;
                }
              }
            }

            // Otherwise, set selection to exactly this slot
            setStartHour(slotStart.getHours());
            setStartMin(slotStart.getMinutes());
            setEndHour(slotEnd.getHours());
            setEndMin(slotEnd.getMinutes());
          }}
        />
      </section>

      {/* 確認モーダル（簡易） */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-3">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl max-h-[85vh]">
            <div className="flex items-center gap-2 border-b border-zinc-200 bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-3">
              <div className="text-lg">📝</div>
              <h3 className="text-base font-semibold text-white">最終確認</h3>
            </div>
            <div className="p-5 overflow-y-auto">
              <div className="grid gap-3 text-sm text-zinc-900 sm:grid-cols-2">
                <div className="rounded-lg bg-zinc-50 p-3">
                  <div className="text-xs text-zinc-500">日付</div>
                  <div className="mt-1 font-medium">{`${year ?? "XXXX"}年${padOrXX(month)}月${padOrXX(day)}日(${weekday || "X"})`}</div>
                </div>
                <div className="rounded-lg bg-zinc-50 p-3">
                  <div className="text-xs text-zinc-500">時間</div>
                  <div className="mt-1 font-medium">{formatTimeRange(startHour, startMin, endHour, endMin)}</div>
                </div>
                <div className="rounded-lg bg-zinc-50 p-3">
                  <div className="text-xs text-zinc-500">名前</div>
                  <div className="mt-1 font-medium">{name || "(未入力)"}</div>
                </div>
                <div className="rounded-lg bg-zinc-50 p-3">
                  <div className="text-xs text-zinc-500">目的</div>
                  <div className="mt-1 font-medium">{purpose}</div>
                </div>
                <div className="rounded-lg bg-zinc-50 p-3 sm:col-span-2">
                  <div className="text-xs text-zinc-500">連絡手段</div>
                  <div className="mt-1 font-medium">
                    {contactMethod}
                    {contactMethod === "discord" && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-700">Discord名: {discordName || "(必須)"}</span>
                    )}
                    {contactMethod === "slack" && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-700">Slack名: {slackName || "(必須)"}</span>
                    )}
                    {contactMethod === "other" && otherNote && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-700">備考: {otherNote}</span>
                    )}
                  </div>
                </div>
                <div className="rounded-lg bg-zinc-50 p-3 sm:col-span-2">
                  <div className="text-xs text-zinc-500">メール</div>
                  <div className="mt-1 font-medium">{email || "(メール未入力)"}</div>
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 hover:bg-zinc-50" onClick={() => setConfirmOpen(false)}>
                  キャンセル
                </button>
                <button className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500" onClick={handleSubmit}>
                  送信する
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 作成中モーダル */}
      {creating && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40">
          <div className="w-full max-w-xs rounded-xl border border-zinc-200 bg-white p-5 shadow-lg text-center">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-600" />
            <div className="text-sm text-zinc-700">イベントを作成しています…</div>
          </div>
        </div>
      )}

      {/* 作成完了モーダル */}
      {createdInfo && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-3">
          <div className="w-full max-w-lg sm:max-w-xl md:max-w-2xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl max-h-[85vh]">
            <div className="flex items-center gap-2 border-b border-zinc-200 bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-3">
              <div className="text-lg">✅</div>
              <h3 className="text-base font-semibold text-white">作成しました！</h3>
            </div>
            <div className="p-5 overflow-y-auto">
              {createdInfo.ok ? (
                <div className="space-y-3 text-sm text-zinc-800">
                  {createdInfo.eventId && (
                    <div>
                      <div className="text-xs text-zinc-500">EventID</div>
                      <div className="mt-1 inline-flex items-center rounded-md bg-zinc-100 px-2 py-1 font-mono text-[13px] text-zinc-800">{createdInfo.eventId}</div>
                      <p className="mt-1 text-xs text-zinc-600">問い合わせの際はこちらのEventIDを記載の上お問い合わせください。</p>
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
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="rounded-lg bg-zinc-50 p-3">
                        <div className="text-xs text-zinc-500">日付</div>
                        <div className="mt-1 font-medium">{`${year ?? "XXXX"}年${padOrXX(month)}月${padOrXX(day)}日(${weekday || "X"})`}</div>
                      </div>
                      <div className="rounded-lg bg-zinc-50 p-3">
                        <div className="text-xs text-zinc-500">時間</div>
                        <div className="mt-1 font-medium">{formatTimeRange(startHour, startMin, endHour, endMin)}</div>
                      </div>
                      <div className="rounded-lg bg-zinc-50 p-3">
                        <div className="text-xs text-zinc-500">名前</div>
                        <div className="mt-1 font-medium">{name || "(未入力)"}</div>
                      </div>
                      <div className="rounded-lg bg-zinc-50 p-3">
                        <div className="text-xs text-zinc-500">目的</div>
                        <div className="mt-1 font-medium">{purpose}</div>
                      </div>
                      <div className="rounded-lg bg-zinc-50 p-3 sm:col-span-2">
                        <div className="text-xs text-zinc-500">連絡手段</div>
                        <div className="mt-1 font-medium">
                          {contactMethod}
                          {contactMethod === "discord" && (
                            <span className="ml-2 inline-flex items-center rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-700">Discord名: {discordName || "(未入力)"}</span>
                          )}
                          {contactMethod === "slack" && (
                            <span className="ml-2 inline-flex items-center rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-700">Slack名: {slackName || "(未入力)"}</span>
                          )}
                          {contactMethod === "other" && otherNote && (
                            <span className="ml-2 inline-flex items-center rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-700">備考: {otherNote}</span>
                          )}
                        </div>
                      </div>
                      <div className="rounded-lg bg-zinc-50 p-3 sm:col-span-2">
                        <div className="text-xs text-zinc-500">メール</div>
                        <div className="mt-1 font-medium">{email || "(メール未入力)"}</div>
                      </div>
                    </div>
                  </div>

                  {/* ご案内 */}
                  <div className="mt-4 rounded-lg bg-amber-50 p-3 text-[13px] leading-relaxed text-amber-900">
                    <p>・予約いただいたのにこちらの都合で取り消しさせていただく場合があります。その際はメールなどでお知らせします。</p>
                    <p className="mt-1">・予約の取り消しをご希望の場合は、メール（<a className="underline" href="mailto:tanahashishuta@gmail.com">tanahashishuta@gmail.com</a>）またはDiscord・Slackでご連絡ください。</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-red-600">作成に失敗しました。</p>
              )}
              <div className="mt-5 flex justify-end">
                <button
                  className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800"
                  onClick={() => {
                    setCreatedInfo(null);
                    if (typeof window !== "undefined") window.location.reload();
                  }}
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 取消機能は廃止 */}
    </main>
  );
}

function weekdayName(d: Date) {
  return ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
}
function range(min: number, max: number) {
  const arr: number[] = [];
  for (let i = min; i <= max; i++) arr.push(i);
  return arr;
}
function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function getMonday(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // Monday as start
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function isOverlappingBusy(start: Date, end: Date, busy: { start: string; end: string }[]): boolean {
  const s = start.getTime();
  const e = end.getTime();
  return busy.some((b) => {
    const bs = new Date(b.start).getTime();
    const be = new Date(b.end).getTime();
    return Math.max(s, bs) < Math.min(e, be);
  });
}

function WeekGrid({
  busy,
  focusDate,
  selectedStart,
  selectedEnd,
  onSelectSlot,
}: {
  busy: { start: string; end: string }[];
  focusDate: Date;
  selectedStart: Date;
  selectedEnd: Date;
  onSelectSlot: (slotStart: Date, slotEnd: Date) => void;
}) {
  const monday = getMonday(focusDate);
  const days = Array.from({ length: 7 }, (_, i) => new Date(monday.getTime() + i * 86400000));
  // 30-min slots: 9:00 to 24:00 -> 15 hours * 2 = 30 rows
  const rows = Array.from({ length: 30 }, (_, i) => ({ hour: 9 + Math.floor(i / 2), min: i % 2 === 0 ? 0 : 30 }));
  const now = new Date();
  const leadMs = 2 * 60 * 60 * 1000; // 2 hours
  const leadCutoff = new Date(now.getTime() + leadMs);
  const oneMonthLater = new Date(now);
  oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[700px] rounded-lg border border-zinc-200">
        <div className="grid grid-cols-[100px_repeat(7,1fr)] text-zinc-900">
          {/* header row */}
          <div />
          {days.map((d) => (
            <div key={d.toDateString()} className="p-2 text-center text-sm text-zinc-600">
              {`${d.getMonth() + 1}/${d.getDate()}(${weekdayName(d)})`}
            </div>
          ))}
          {/* hours rows */}
          {rows.map(({ hour, min }) => (
            <React.Fragment key={`${hour}:${min}`}>
              <div className="border-t border-zinc-200 p-1 text-right text-xs text-zinc-500">
                {min === 0 ? `${pad(hour)}:00` : `${pad(hour)}:30`}
              </div>
              {days.map((d) => {
                const cellStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, min, 0);
                const cellEnd = new Date(cellStart.getTime() + 30 * 60 * 1000);
                const isPast = cellEnd.getTime() <= now.getTime();
                const withinLead = cellStart.getTime() < leadCutoff.getTime();
                const beyondOneMonth = cellStart.getTime() > oneMonthLater.getTime();
                const blocked = isOverlappingBusy(cellStart, cellEnd, busy);
                const withinSelection = cellEnd > selectedStart && cellStart < selectedEnd;
                return (
                  <button
                    type="button"
                    key={`${d.toDateString()}-${hour}-${min}`}
                    className={`border-t border-l border-zinc-200 p-2 text-center text-xs transition-colors ${
                      blocked || isPast || withinLead || beyondOneMonth
                        ? "cursor-not-allowed bg-zinc-100 text-zinc-400"
                        : withinSelection
                        ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
                        : "bg-white hover:bg-zinc-50"
                    }`}
                    disabled={blocked || isPast || withinLead || beyondOneMonth}
                    onClick={() => {
                      if (isPast || withinLead || beyondOneMonth) return;
                      onSelectSlot(cellStart, cellEnd);
                    }}
                  >
                    {isPast ? "過去" : withinLead || beyondOneMonth ? "不可" : blocked ? "不可" : withinSelection ? "選択中" : "可"}
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

function padOrXX(n: number | null): string {
  if (n == null) return "XX";
  return pad(n);
}

function formatTimeRange(sh: number | null, sm: number | null, eh: number | null, em: number | null): string {
  if (sh == null || sm == null || eh == null || em == null) return "XX : XX ~ XX : XX";
  return `${pad(sh)} : ${pad(sm)} ~ ${pad(eh)} : ${pad(em)}`;
}

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function UnderLabelSelect({ value, setValue, options, underLabel }: { value: number | null; setValue: (n: number) => void; options: number[]; underLabel: string }) {
  return (
    <div className="flex flex-col items-center">
      <select className="w-full rounded-md border border-zinc-300 bg-white p-2 text-center text-zinc-900" value={value ?? ""} onChange={(e) => setValue(Number(e.target.value))}>
        <option value="" disabled hidden>
          --
        </option>
        {options.map((o) => (
          <option key={o} value={o}>
            {pad(o)}
          </option>
        ))}
      </select>
      <div className="mt-1 text-xs text-zinc-500">{underLabel}</div>
    </div>
  );
}


