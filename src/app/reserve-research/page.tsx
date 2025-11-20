"use client";

import React from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, CalendarClock, NotebookText } from "lucide-react";
import { CircleCheckLoader } from "../../shared/ui/CircleCheckLoader";

export default function ReserveHourlyPage() {
  // 11/25の週(11/25月)から12/28の週(12/26金)までの期間制限
  const allowedStartDate = React.useMemo(() => new Date(2025, 10, 25), []); // 2025/11/25
  const allowedEndDate = React.useMemo(() => new Date(2025, 11, 28, 23, 59, 59), []); // 2025/12/26
  const currentMonday = getMonday(allowedStartDate);
  const [weekStart, setWeekStart] = React.useState<Date>(currentMonday);

  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [emailError, setEmailError] = React.useState("");
  const [selectedDate, setSelectedDate] = React.useState<Date | null>(null);
  const [selectedHour, setSelectedHour] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState<{ start: string; end: string }[]>([]);
  const [busyLoading, setBusyLoading] = React.useState(true);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [createdInfo, setCreatedInfo] = React.useState<{ ok: boolean; eventId?: string; htmlLink?: string; meetLink?: string } | null>(null);

  // Fetch busy intervals for current week
  React.useEffect(() => {
    setBusyLoading(true);
    fetch("/api/ical/busy?noBuffer=1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekStartISO: weekStart.toISOString() }),
    })
      .then((r) => r.json())
      .then((d) => setBusy(d.busy || []))
      .catch(() => setBusy([]))
      .finally(() => setBusyLoading(false));
  }, [weekStart]);

  // メールアドレスのバリデーション
  React.useEffect(() => {
    if (email.trim() === "") {
      setEmailError("");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setEmailError("有効なメールアドレスを入力してください");
    } else {
      setEmailError("");
    }
  }, [email]);

  const canSubmit = name.trim() !== "" && email.trim() !== "" && emailError === "" && selectedDate !== null && selectedHour !== null;

  const handleSubmit = async () => {
    if (!canSubmit || !selectedDate || selectedHour === null) return;

    setConfirmOpen(false);
    setCreating(true);
    const payload = {
      year: selectedDate.getFullYear(),
      month: selectedDate.getMonth() + 1,
      day: selectedDate.getDate(),
      startHour: selectedHour,
      name,
      email,
    };

    try {
      const res = await fetch("/api/reserve-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      const ok = !!json?.ok;
      setCreatedInfo({ ok, eventId: json?.eventId, htmlLink: json?.htmlLink, meetLink: json?.meetLink });
      if (ok) {
        setName("");
        setEmail("");
        setSelectedDate(null);
        setSelectedHour(null);
      } else {
        alert("予約の作成に失敗しました");
      }
    } catch {
      setCreatedInfo({ ok: false });
      alert("予約の作成に失敗しました");
    } finally {
      setCreating(false);
    }
  };

  // Check if a 1-hour slot is available (no overlap with busy intervals)
  const isSlotAvailable = (date: Date, hour: number): boolean => {
    const slotStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, 0, 0, 0);
    const slotEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour + 1, 0, 0, 0);

    // 期間外は不可
    if (slotStart < allowedStartDate || slotStart > allowedEndDate) {
      return false;
    }

    // 11/24(月)は不可
    if (date.getFullYear() === 2025 && date.getMonth() === 10 && date.getDate() === 24) {
      return false;
    }

    // 土日は不可
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return false;
    }

    // Check if any part of the hour overlaps with busy intervals
    return !busy.some((b) => {
      const busyStart = new Date(b.start).getTime();
      const busyEnd = new Date(b.end).getTime();
      const slotStartMs = slotStart.getTime();
      const slotEndMs = slotEnd.getTime();
      // If there's any overlap at all, the slot is unavailable
      return Math.max(slotStartMs, busyStart) < Math.min(slotEndMs, busyEnd);
    });
  };

  // Generate week days
  const weekDays = React.useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const hours = Array.from({ length: 14 }, (_, i) => 9 + i); // 9-22

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:p-6">
      <main className="max-w-6xl mx-auto">
        <motion.h1
          className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-slate-900 via-slate-700 to-slate-600 bg-clip-text text-transparent"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          実験協力予約
        </motion.h1>

        <p className="mt-3 text-sm text-slate-600">
          実験のご協力ありがとうございます。<br />
          9:00 - 22:00の1時間単位で予約できます（2025/11/25 - 12/26の平日のみ、土日祝を除く）
        </p>

        {/* Name and Email */}
        <section className="mt-6 rounded-2xl border border-white/20 bg-white/90 p-6 shadow-lg backdrop-blur animate-in fade-in-50">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h2 className="mb-3 text-sm font-semibold text-zinc-700">お名前</h2>
              <input
                className="w-full rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 placeholder-zinc-400 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                placeholder="お名前"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <h2 className="mb-3 text-sm font-semibold text-zinc-700">メールアドレス(Gmailだと嬉しいです)</h2>
              <input
                className={`w-full rounded-md border bg-white p-2 text-zinc-900 placeholder-zinc-400 transition focus:outline-none focus:ring-2 ${
                  emailError
                    ? "border-red-500 focus:border-red-500 focus:ring-red-500/50"
                    : "border-zinc-300 focus:border-blue-500 focus:ring-blue-500/50"
                }`}
                type="email"
                placeholder="your.name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {emailError && (
                <p className="mt-1 text-xs text-red-600">{emailError}</p>
              )}
            </div>
          </div>
        </section>

        {/* Selected Time Display */}
        {selectedDate && selectedHour !== null && (
          <section className="mt-6 rounded-2xl border border-white/20 bg-white/90 p-6 shadow-lg backdrop-blur animate-in fade-in-50">
            <h2 className="mb-3 text-sm font-semibold text-zinc-700">選択中の日時</h2>
            <p className="text-sm text-zinc-900">
              {`${selectedDate.getFullYear()}年${selectedDate.getMonth() + 1}月${selectedDate.getDate()}日(${weekdayName(selectedDate)}) ${String(selectedHour).padStart(2, '0')}:00 - ${String(selectedHour + 1).padStart(2, '0')}:00`}
            </p>
          </section>
        )}

        {/* Week Calendar */}
        <section className="relative mt-6 rounded-2xl border border-white/20 bg-white/90 p-6 shadow-lg backdrop-blur animate-in fade-in-50">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-700">
              <CalendarClock className="h-4 w-4 text-zinc-500" />
              日時選択
            </h2>
            <div className="flex items-center gap-2">
              <button
                className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 transition hover:bg-zinc-50 disabled:opacity-50"
                onClick={() => setWeekStart(new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000))}
                disabled={weekStart.getTime() <= getMonday(allowedStartDate).getTime()}
              >
                <ChevronLeft className="h-4 w-4" /> 前の週
              </button>
              <div className="text-xs text-zinc-600">
                {`${weekStart.getMonth() + 1}/${weekStart.getDate()}`} 〜 {`${new Date(weekStart.getTime() + 6 * 86400000).getMonth() + 1}/${new Date(weekStart.getTime() + 6 * 86400000).getDate()}`}
              </div>
              <button
                className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 transition hover:bg-zinc-50 disabled:opacity-50"
                onClick={() => setWeekStart(new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000))}
                disabled={new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000) > getMonday(allowedEndDate)}
              >
                次の週 <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {busyLoading && (
            <div className="absolute inset-0 z-10 grid place-items-center bg-white/60 backdrop-blur-sm rounded-2xl">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-600" />
            </div>
          )}

          <div className="overflow-x-auto">
            <div className="min-w-[700px] overflow-hidden rounded-2xl border border-white/20 bg-white/90 shadow-lg backdrop-blur">
              <div className="grid grid-cols-[100px_repeat(7,1fr)] text-zinc-900">
                <div className="bg-gradient-to-b from-zinc-50 to-white" />
                {weekDays.map((day, i) => {
                  const isToday = day.toDateString() === new Date().toDateString();
                  return (
                    <div
                      key={i}
                      className={`p-2 text-center text-sm font-semibold ${
                        isToday
                          ? "bg-gradient-to-b from-blue-100 to-blue-50 text-blue-700 border-b-2 border-blue-400"
                          : "bg-gradient-to-b from-zinc-50 to-white text-zinc-600"
                      }`}
                    >
                      {`${day.getMonth() + 1}/${day.getDate()}(${weekdayName(day)})`}
                    </div>
                  );
                })}

                {hours.map((hour) => (
                  <React.Fragment key={hour}>
                    <div className="font-semibold text-zinc-700 p-2 text-right text-xs">
                      {`${String(hour).padStart(2, '0')}:00 - ${String(hour + 1).padStart(2, '0')}:00`}
                    </div>
                    {weekDays.map((day, dayIdx) => {
                      const slotDate = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, 0, 0, 0);
                      const isPast = slotDate.getTime() <= Date.now();
                      const available = !isPast && isSlotAvailable(day, hour);
                      const isSelected = selectedDate?.getTime() === day.getTime() && selectedHour === hour;

                      return (
                        <button
                          key={dayIdx}
                          disabled={!available || busyLoading}
                          onClick={() => {
                            if (available) {
                              setSelectedDate(day);
                              setSelectedHour(hour);
                            }
                          }}
                          className={`border-t border-l border-zinc-200 p-2 text-center text-xs transition-colors focus:z-10 focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
                            !available
                              ? "cursor-not-allowed bg-zinc-100 text-zinc-400"
                              : isSelected
                              ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
                              : "bg-white hover:bg-zinc-50"
                          }`}
                        >
                          {!available ? "不可" : isSelected ? "選択中" : "可"}
                        </button>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Submit Button */}
        <div className="mt-6 flex justify-end">
          <button
            className={`rounded-xl px-8 py-3 text-lg font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              canSubmit
                ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25 hover:from-blue-500 hover:to-indigo-500"
                : "bg-zinc-300 text-zinc-500 cursor-not-allowed"
            }`}
            disabled={!canSubmit || creating || confirmOpen}
            onClick={() => {
              if (!canSubmit || confirmOpen) return;
              setConfirmOpen(true);
            }}
          >
            予約する
          </button>
        </div>

        {/* Confirm Modal */}
        {confirmOpen && selectedDate && selectedHour !== null && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-3 backdrop-blur-sm">
            <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/20 bg-white/95 shadow-2xl backdrop-blur">
              <div className="border-b border-white/20 bg-gradient-to-r from-blue-500/90 to-indigo-500/90 px-5 py-3">
                <h3 className="text-base font-semibold text-white drop-shadow">予約内容の確認</h3>
              </div>
              <div className="p-6">
                <div className="space-y-3 text-sm text-zinc-700">
                  <div>
                    <span className="font-semibold">お名前:</span> {name}
                  </div>
                  <div>
                    <span className="font-semibold">メールアドレス:</span> {email}
                  </div>
                  <div>
                    <span className="font-semibold">日時:</span> {selectedDate.getFullYear()}年{selectedDate.getMonth() + 1}月{selectedDate.getDate()}日({weekdayName(selectedDate)}) {String(selectedHour).padStart(2, '0')}:00 - {String(selectedHour + 1).padStart(2, '0')}:00
                  </div>
                </div>
                <p className="mt-4 text-xs text-zinc-600">
                  入力いただいたメールアドレスに Google カレンダーから招待が届きます。
                </p>
                <div className="mt-6 flex gap-3">
                  <button
                    className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
                    onClick={() => setConfirmOpen(false)}
                    disabled={creating}
                  >
                    キャンセル
                  </button>
                  <button
                    className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
                    onClick={handleSubmit}
                    disabled={creating}
                  >
                    予約する
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Creating Modal */}
        {creating && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-3 backdrop-blur-sm">
            <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/20 bg-white/95 shadow-2xl backdrop-blur">
              <div className="flex items-center gap-2 border-b border-white/20 bg-gradient-to-r from-blue-500/90 to-indigo-500/90 px-5 py-3 backdrop-blur">
                <NotebookText className="h-5 w-5 text-white" aria-hidden="true" />
                <h3 className="text-base font-semibold text-white drop-shadow">予定を作成します</h3>
              </div>
              <div className="p-8 text-center">
                <div className="mx-auto mb-4 flex items-center justify-center">
                  <CircleCheckLoader isComplete={false} size={64} />
                </div>
                <div className="text-sm font-medium text-zinc-700">予定を作成しています…</div>
              </div>
            </div>
          </div>
        )}

        {/* Completion Modal */}
        {createdInfo && !creating && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-3 backdrop-blur-sm">
            <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/20 bg-white/95 shadow-2xl backdrop-blur">
              <div className="border-b border-white/20 bg-gradient-to-r from-blue-500/90 to-indigo-500/90 px-5 py-3">
                <h3 className="text-base font-semibold text-white drop-shadow">
                  {createdInfo.ok ? "✅ 予定を作成しました！" : "❌ 予約に失敗しました"}
                </h3>
              </div>
              <div className="p-6">
                {createdInfo.ok ? (
                  <>
                    {/* 完了アニメーション */}
                    <div className="mb-6 flex items-center justify-center">
                      <CircleCheckLoader isComplete={true} size={80} />
                    </div>
                    <p className="text-sm text-zinc-700 mb-4">
                      予約が完了しました。入力いただいたメールアドレスに Google カレンダーから招待が届きますのでご確認ください。
                    </p>
                    {createdInfo.htmlLink && (
                      <div className="mb-4">
                        <a
                          href={createdInfo.htmlLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:underline"
                        >
                          Google カレンダーで確認
                        </a>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-zinc-700 mb-4">
                    予約の作成に失敗しました。もう一度お試しください。
                  </p>
                )}
                <button
                  className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
                  onClick={() => {
                    setCreatedInfo(null);
                    if (createdInfo.ok && typeof window !== "undefined") window.location.reload();
                  }}
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function weekdayName(d: Date) {
  return ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
}

function getMonday(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}
