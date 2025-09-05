"use client";

import React from "react";
import { motion } from "framer-motion";
import { HeroBackground } from "../../shared/ui/HeroBackground";
import { PURPOSES } from "../../shared/config/purposes";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { contactSchema, type ContactForm } from "../../shared/validation/reserve";
import { ContactFields } from "../../feature/reserve/ui/ContactFields";
import { DateTimeFields } from "../../feature/reserve/ui/DateTimeFields";
import { MeetingNoteField } from "../../feature/reserve/ui/MeetingNoteField";
import { WeekGrid as WeekGridComponent } from "../../feature/reserve/ui/WeekGrid";
import { CompletionModal } from "../../feature/reserve/ui/CompletionModal";
import { useAtom } from "jotai";
import { Info, ChevronLeft, ChevronRight, CalendarClock, NotebookText } from "lucide-react";
import {
  emailAtom,
  contactMethodAtom,
  discordServerAtom,
  discordNameAtom,
  slackWorkspaceAtom,
  slackNameAtom,
  otherNoteAtom,
  nameAtom,
  purposeAtom,
  yearAtom,
  monthAtom,
  dayAtom,
  startHourAtom,
  startMinAtom,
  endHourAtom,
  endMinAtom,
  meetingNoteAtom,
} from "../../feature/reserve/state";
import Image from "next/image";
import { AlertBanner } from "../../shared/ui/AlertBanner";

// Purpose type and list centralized in shared config

export default function ReservePage() {
  const bgImages = ["/image.png", "/image2.png", "/image3.png"];
  const now = React.useMemo(() => new Date(), []);
  const currentMonday = getMonday(now);
  const [weekStart, setWeekStart] = React.useState<Date>(currentMonday);
  const oneMonthLater = React.useMemo(() => {
    const d = new Date(now);
    d.setMonth(d.getMonth() + 1);
    return d;
  }, [now]);
  const [year, setYear] = useAtom(yearAtom);
  const [month, setMonth] = useAtom(monthAtom);
  const [day, setDay] = useAtom(dayAtom);
  const [startHour, setStartHour] = useAtom(startHourAtom);
  const [startMin, setStartMin] = useAtom(startMinAtom);
  const [endHour, setEndHour] = useAtom(endHourAtom);
  const [endMin, setEndMin] = useAtom(endMinAtom);
  const [name, setName] = useAtom(nameAtom);
  const [email, setEmail] = useAtom(emailAtom);
  const [formErrors, setFormErrors] = React.useState<Record<string, string>>({});
  const [purpose, setPurpose] = useAtom(purposeAtom);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [createdInfo, setCreatedInfo] = React.useState<{ ok: boolean; eventId?: string; htmlLink?: string; meetLink?: string } | null>(null);
  const [contactMethod, setContactMethod] = useAtom(contactMethodAtom);
  const [discordName, setDiscordName] = useAtom(discordNameAtom);
  const [slackName, setSlackName] = useAtom(slackNameAtom);
  const [otherNote, setOtherNote] = useAtom(otherNoteAtom);
  const [discordServer, setDiscordServer] = useAtom(discordServerAtom);
  const [discordServerTouched, setDiscordServerTouched] = React.useState(false);
  const [slackWorkspace, setSlackWorkspace] = useAtom(slackWorkspaceAtom);
  const [meetingNote, setMeetingNote] = useAtom(meetingNoteAtom);
  const [busy, setBusy] = React.useState<{ start: string; end: string }[]>([]);
  const [busyLoading, setBusyLoading] = React.useState(true);
  const [notify, setNotify] = React.useState<string>("");
  const [completedDetails, setCompletedDetails] = React.useState<{
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
    meetingNote?: string;
  } | null>(null);

  const hasDate = year != null && month != null && day != null;
  const hasTime = startHour != null && startMin != null && endHour != null && endMin != null;
  const selectedStart = hasDate && hasTime
    ? new Date(year as number, (month as number) - 1, day as number, startHour as number, startMin as number, 0, 0)
    : new Date(0);
  const selectedEnd = hasDate && hasTime
    ? new Date(year as number, (month as number) - 1, day as number, endHour as number, endMin as number, 0, 0)
    : new Date(0);

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

  const zodDirectErrors = React.useMemo(() => {
    const result = contactSchema.safeParse({
      name,
      email,
      purpose: purpose || "",
      contactMethod: contactMethod || "",
      discordServer,
      discordName,
      slackWorkspace,
      slackName,
      otherNote,
    });
    const errs: Record<string, string> = {};
    if (!result.success) {
      for (const issue of result.error.issues) {
        const path = (issue.path?.[0] as string) || "";
        if (path && issue.message) errs[path] = issue.message;
      }
    }
    if (hasDate && hasTime) {
      const s = new Date(year as number, (month as number) - 1, day as number, startHour as number, startMin as number);
      const e = new Date(year as number, (month as number) - 1, day as number, endHour as number, endMin as number);
      if (!(e > s)) {
        errs.time = "終了は開始より後にしてください";
      }
    }
    return errs;
  }, [name, email, purpose, contactMethod, discordServer, discordName, slackWorkspace, slackName, otherNote, hasDate, hasTime, year, month, day, startHour, startMin, endHour, endMin]);

  const canSubmit = React.useMemo(() => {
    if (hasDate && hasTime && selectionInvalid) return false;
    return Object.keys(zodDirectErrors).length === 0;
  }, [zodDirectErrors, hasDate, hasTime, selectionInvalid]);

  const submitBlockMessage = React.useMemo(() => {
    if (Object.keys(zodDirectErrors).length > 0) return "入力内容をご確認ください";
    if (hasDate && hasTime && selectionInvalid) return "ご指定の時間では予約できません";
    return "";
  }, [zodDirectErrors, hasDate, hasTime, selectionInvalid]);

  React.useEffect(() => {
    if (submitBlockMessage) {
      // デバッグ: 送信不可の要因を出力
      // 注意: 実運用では個人情報のログ出力に配慮してください
      console.log("[Reserve] submit blocked", {
        errors: { rhf: formErrors, zod: zodDirectErrors },
        name,
        email,
        purpose,
        contactMethod,
        hasDate,
        hasTime,
        selectionInvalid,
        year,
        month,
        day,
        startHour,
        startMin,
        endHour,
        endMin,
      });
    }
  }, [submitBlockMessage, formErrors, zodDirectErrors, name, email, purpose, contactMethod, hasDate, hasTime, selectionInvalid, year, month, day, startHour, startMin, endHour, endMin]);

  // fetch busy intervals for current week (Mon-Sun)
  React.useEffect(() => {
    setBusyLoading(true);
    fetch("/api/ical/busy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekStartISO: weekStart.toISOString() }),
    })
      .then((r) => r.json())
      .then((d) => setBusy(d.busy || []))
      .catch(() => setBusy([]))
      .finally(() => setBusyLoading(false));
  }, [weekStart]);

  const weekdayText = React.useMemo(() => {
    if (!hasDate) return "";
    return weekdayName(new Date(year as number, (month as number) - 1, day as number));
  }, [hasDate, year, month, day]);

  const nextAvailableSlotText = React.useMemo(() => {
    if (busyLoading) return "";
    // Search next available 30-min slot within 9:00-24:00 windows, starting from now+2h
    const now2h = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const step = 30 * 60 * 1000;
    const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0, 0, 0);
    const dayEnd = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 24, 0, 0, 0);
    const align = (d: Date) => {
      const t = new Date(d);
      const m = t.getMinutes();
      if (m > 0 && m <= 30) t.setMinutes(30, 0, 0);
      else if (m > 30) { t.setHours(t.getHours() + 1, 0, 0, 0); } else { t.setSeconds(0, 0); }
      return t;
    };
    let t = align(now2h);
    if (t < dayStart(t)) t = dayStart(t);
    if (t >= dayEnd(t)) {
      const nd = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1);
      t = dayStart(nd);
    }
    let guard = 0;
    while (guard < 400) {
      const end = new Date(t.getTime() + step);
      if (end > dayEnd(t)) {
        const nd = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1);
        t = dayStart(nd);
        guard += 1;
        continue;
      }
      if (!isOverlappingBusy(t, end, busy)) {
        return `${t.getFullYear()}/${pad(t.getMonth() + 1)}/${pad(t.getDate())}(${weekdayName(t)}) ${pad(t.getHours())}:${pad(t.getMinutes())}〜${pad(end.getHours())}:${pad(end.getMinutes())}`;
      }
      t = end;
      guard += 1;
    }
    return "";
  }, [busy, busyLoading]);

  // Quick-apply the next available 30-min slot to the selection
  const applyNextAvailableSlot = React.useCallback(() => {
    if (!nextAvailableSlotText) return;
    // Format: YYYY/MM/DD(曜) HH:MM〜HH:MM
    const m = nextAvailableSlotText.match(/^(\d{4})\/(\d{2})\/(\d{2})\(.+\)\s+(\d{2}):(\d{2})〜(\d{2}):(\d{2})$/);
    if (!m) return;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const sh = Number(m[4]);
    const sm = Number(m[5]);
    const eh = Number(m[6]);
    const em = Number(m[7]);
    setYear(y);
    setMonth(mo);
    setDay(d);
    setStartHour(sh);
    setStartMin(sm);
    setEndHour(eh);
    setEndMin(em);
    // Align week view to the selected date
    const selectedDate = new Date(y, mo - 1, d);
    setWeekStart(getMonday(selectedDate));
    // Show notification banner
    setNotify(`予約日時を ${nextAvailableSlotText} にセットしました`);
    try {
      // Auto hide
      setTimeout(() => setNotify(""), 3000);
    } catch {}
  }, [nextAvailableSlotText, setYear, setMonth, setDay, setStartHour, setStartMin, setEndHour, setEndMin]);



  const { register, trigger, setValue, watch } = useForm<ContactForm>({
    resolver: zodResolver(contactSchema),
    mode: "onChange",
    reValidateMode: "onChange",
    defaultValues: {
      name,
      email,
      purpose: purpose || "",
      contactMethod: (contactMethod || "") as ContactForm["contactMethod"],
      discordServer,
      discordName,
      slackWorkspace,
      slackName,
      otherNote,
    },
  });

  const watchedName = watch("name");

  React.useEffect(() => {
    const sub = watch((v) => {
      if (!v) return;
      if (typeof v.name === "string") setName(v.name);
      if (typeof v.email === "string") setEmail(v.email);
      if (v.contactMethod) setContactMethod(v.contactMethod);
      if (typeof v.discordServer === "string") setDiscordServer(v.discordServer);
      if (typeof v.discordName === "string") setDiscordName(v.discordName);
      if (typeof v.slackWorkspace === "string") setSlackWorkspace(v.slackWorkspace);
      if (typeof v.slackName === "string") setSlackName(v.slackName);
      if (typeof v.otherNote === "string") setOtherNote(v.otherNote);
    });
    return () => sub.unsubscribe();
  }, [watch, setName, setEmail, setContactMethod, setDiscordServer, setDiscordName, setSlackWorkspace, setSlackName, setOtherNote]);

  React.useEffect(() => { setValue("name", name, { shouldValidate: true }); }, [name, setValue]);
  React.useEffect(() => { trigger("name"); }, [name, trigger]);
  React.useEffect(() => { setValue("email", email, { shouldValidate: true }); }, [email, setValue]);
  React.useEffect(() => { trigger("email"); }, [email, trigger]);
  React.useEffect(() => { setValue("contactMethod", (contactMethod || "") as ContactForm["contactMethod"], { shouldValidate: true }); }, [contactMethod, setValue]);
  React.useEffect(() => { trigger(); }, [contactMethod, trigger]);
  React.useEffect(() => { setValue("purpose", purpose || "", { shouldValidate: true }); }, [purpose, setValue]);
  React.useEffect(() => { trigger("purpose"); }, [purpose, trigger]);
  React.useEffect(() => { setValue("discordServer", discordServer, { shouldValidate: false }); }, [discordServer, setValue]);
  React.useEffect(() => { setValue("discordName", discordName, { shouldValidate: false }); }, [discordName, setValue]);
  React.useEffect(() => { setValue("slackWorkspace", slackWorkspace, { shouldValidate: false }); }, [slackWorkspace, setValue]);
  React.useEffect(() => { setValue("slackName", slackName, { shouldValidate: false }); }, [slackName, setValue]);
  React.useEffect(() => { setValue("otherNote", otherNote, { shouldValidate: false }); }, [otherNote, setValue]);

  React.useEffect(() => {
    setFormErrors(zodDirectErrors);
  }, [zodDirectErrors]);

  React.useEffect(() => {
    if (contactMethod === "discord" && purpose === "TechSelect+" && !discordServerTouched && !discordServer.trim()) {
      setDiscordServer("Tech Select");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactMethod, purpose]);

  const hours = React.useMemo(() => Array.from({ length: 16 }, (_, i) => 9 + i), []); // 9-24
  const minuteOptions = React.useMemo(() => [0, 30], []);
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
  const yearOptions = React.useMemo(() => (currentMonth === 12 ? [currentYear, currentYear + 1] : [currentYear]), [currentYear, currentMonth]);
  const monthOptions = React.useMemo(() => (currentMonth === 12 ? [12, 1] : [currentMonth, nextMonth]), [currentMonth, nextMonth]);
  React.useEffect(() => {
    if (month == null || !monthOptions.includes(month)) {
      setMonth(monthOptions[0] ?? null);
    }
  }, [month, monthOptions, setMonth]);

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
    const ok = await trigger();
    if (!ok) return;
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
      weekday: weekdayText,
      start: { hour: startHour, minute: startMin },
      end: { hour: endHour, minute: endMin },
      name,
      email,
      purpose,
      contactMethod,
      discordName: contactMethod === "discord" ? discordName.trim() : undefined,
      discordServer: contactMethod === "discord" ? discordServer.trim() : undefined,
      slackName: contactMethod === "slack" ? slackName.trim() : undefined,
      slackWorkspace: contactMethod === "slack" ? slackWorkspace.trim() : undefined,
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
      const ok = !!json?.ok;
      // Snapshot details BEFORE clearing state so modal can show consistent data
      if (ok) {
        setCompletedDetails({
          year,
          month,
          day,
          weekday: weekdayText,
          startHour,
          startMin,
          endHour,
          endMin,
          name,
          purpose,
          email,
          discordName,
          slackName,
          otherNote,
          meetingNote,
        });
      }
      setCreatedInfo({ ok, eventId: json?.eventId, htmlLink: json?.htmlLink, meetLink: json?.meetLink });
      if (ok) {
        // 成功送信後は次回以降の自動保存をクリア
        try {
          if (typeof window !== "undefined") {
            const keys = [
              "reserve_email",
              "reserve_contact_method",
              "reserve_discord_server",
              "reserve_discord_name",
              "reserve_slack_workspace",
              "reserve_slack_name",
              "reserve_other_note",
              "reserve_purpose",
              "reserve_name",
              "reserve_year",
              "reserve_month",
              "reserve_day",
              "reserve_start_hour",
              "reserve_start_min",
              "reserve_end_hour",
              "reserve_end_min",
              "reserve_meeting_note",
            ];
            keys.forEach((k) => window.localStorage.removeItem(k));
          }
        } catch {}
        // 画面上の値も初期化
        setName("");
        setEmail("");
        setPurpose("");
        setContactMethod("");
        setDiscordServer("");
        setDiscordName("");
        setSlackWorkspace("");
        setSlackName("");
        setOtherNote("");
        setMeetingNote("");
        setYear(null as unknown as number);
        setMonth(null as unknown as number);
        setDay(null as unknown as number);
        setStartHour(null as unknown as number);
        setStartMin(null as unknown as number);
        setEndHour(null as unknown as number);
        setEndMin(null as unknown as number);
      }
    } catch {
      setCreatedInfo({ ok: false });
    } finally {
      setCreating(false);
    }
  }

  return (
    <HeroBackground images={bgImages} intro={{ enabled: false }}>
      <main className="text-white">
      {/* RHF hidden bindings to ensure Zod validation stays in sync with Jotai-controlled fields */}
      <input type="hidden" {...register("name")} value={name} readOnly />
      <input type="hidden" {...register("email")} value={email} readOnly />
      <input type="hidden" {...register("purpose")} value={purpose || ""} readOnly />
      <input type="hidden" {...register("contactMethod")} value={contactMethod || ""} readOnly />
      <input type="hidden" {...register("discordServer")} value={discordServer} readOnly />
      <input type="hidden" {...register("discordName")} value={discordName} readOnly />
      <input type="hidden" {...register("slackWorkspace")} value={slackWorkspace} readOnly />
      <input type="hidden" {...register("slackName")} value={slackName} readOnly />
      <input type="hidden" {...register("otherNote")} value={otherNote} readOnly />
      <motion.h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent drop-shadow" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        お打ち合わせ予約
      </motion.h1>
      <p className="mt-3 text-sm text-white/80">
        お問い合わせはメール(<a className="underline" href="mailto:tanahashishuta@gmail.com">tanahashishuta@gmail.com</a>)またはX(<a className="underline" href="https://x.com/JavaLangRuntime" target="_blank" rel="noreferrer">@JavaLangRuntime</a>)でも承っております
      </p>

      {/* 入力保持の案内 */}
      <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] text-white/80 backdrop-blur">
        <span className="h-2 w-2 rounded-full bg-emerald-400/80" /> 入力内容は10分間保持されます
      </p>

      {nextAvailableSlotText && (
        <div className="mt-4 sm:mt-6">
          <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur animate-in fade-in-50">
            <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-blue-400 to-indigo-500" />
            <div className="ml-3 flex items-center justify-between gap-3">
              <Info className="mt-0.5 h-5 w-5 text-blue-300" aria-hidden="true" />
              <p className="m-0 flex-1 text-sm text-white/90">直近で予約できる30分枠: <span className="font-semibold text-white">{nextAvailableSlotText}</span></p>
              <button
                type="button"
                onClick={applyNextAvailableSlot}
                className="shrink-0 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              >
                この時間で予約
              </button>
            </div>
          </div>
          {notify && (
            <AlertBanner className="mt-2" message={notify} variant="success" />
          )}
        </div>
      )}




      {/* ご相談内容（ご相談内容）を最上部に配置 */}
      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/20 bg-white/90 p-6 shadow-lg backdrop-blur sm:col-span-2 animate-in fade-in-50">
          <h2 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-zinc-700"><CalendarClock className="h-4 w-4 text-zinc-500" /> ご相談内容</h2>
          <select
            className="w-full rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            value={purpose || ""}
            onChange={(e) => setPurpose(e.target.value)}
          >
            <option value="" disabled>---選択してください---</option>
            {PURPOSES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          {formErrors.purpose && <div className="mt-1 text-xs text-red-600">{formErrors.purpose}</div>}
        </div>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <MeetingNoteField value={meetingNote} onChange={setMeetingNote} />
      </section>

      {/* お名前/メールを横並び */}
      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/20 bg-white/90 p-6 shadow-lg backdrop-blur sm:col-span-2 animate-in fade-in-50">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h2 className="mb-3 text-sm font-semibold text-zinc-700">お名前</h2>
              <input
                className="w-full rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 placeholder-zinc-400 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                placeholder="お名前(本名)"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              {formErrors.name && (String(watchedName || "").trim().length === 0) && (
                <div className="mt-1 text-xs text-red-600">{formErrors.name}</div>
              )}
            </div>
            <div>
              <h2 className="mb-3 text-sm font-semibold text-zinc-700">メールアドレス</h2>
              <input
                className="w-full rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 placeholder-zinc-400 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                type="email"
                placeholder="your.name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {formErrors.email && (
                <p className="mt-1 text-xs text-red-600">{formErrors.email}</p>
              )}
            </div>
          </div>
          <div className="mt-3 rounded-md bg-zinc-50 p-3">
            <ul className="list-disc space-y-1 pl-5 text-xs text-zinc-700">
              入力いただいたメールアドレスに Google カレンダーから招待が届きます。お手数ですが必ずご確認ください。
              こちらの都合で予定のキャンセルや変更のお願いを差し上げる場合も、上記のメールアドレス宛にご連絡いたします。
            </ul>
          </div>
        </div>
      </section>

      {/*ご連絡手段（ミーティング媒体）（ミーティング媒体）（ミーティング媒体）を横長で下に配置 */}
      <section className="mt-4 grid gap-4 sm:grid-cols-2">
        <ContactFields
          contactMethod={contactMethod}
          setContactMethod={(v) => setContactMethod(v)}
          email={email}
          setEmail={setEmail}
          discordServer={discordServer}
          setDiscordServer={setDiscordServer}
          onDiscordServerFocus={() => setDiscordServerTouched(true)}
          discordName={discordName}
          setDiscordName={setDiscordName}
          slackWorkspace={slackWorkspace}
          setSlackWorkspace={setSlackWorkspace}
          slackName={slackName}
          setSlackName={setSlackName}
          otherNote={otherNote}
          setOtherNote={setOtherNote}
          errors={{
            contactMethod: formErrors.contactMethod,
            discordServer: formErrors.discordServer,
            discordName: formErrors.discordName,
            slackWorkspace: formErrors.slackWorkspace,
            slackName: formErrors.slackName,
            email: formErrors.email,
          }}
          renderEmail={false}
        />
      </section>

      <DateTimeFields
        year={year}
        month={month}
        day={day}
        setYear={setYear}
        setMonth={setMonth}
        setDay={setDay}
        weekday={weekdayText}
        startHour={startHour}
        startMin={startMin}
        endHour={endHour}
        endMin={endMin}
        setStartHour={setStartHour}
        setStartMin={setStartMin}
        setEndHour={setEndHour}
        setEndMin={setEndMin}
        hours={hours}
        minuteOptions={minuteOptions}
        yearOptions={yearOptions}
        monthOptions={monthOptions}
        selectionInvalid={hasDate && hasTime && selectionInvalid}
        timeError={formErrors.time || zodDirectErrors.time}
      />

      {/* 決定ボタン（カレンダーの上） */}
      <div className="mt-8 flex flex-col items-center justify-center">
        <div className={`relative inline-block ${canSubmit ? "group" : ""}`}>
          {canSubmit && (
            <>
              {/* Left-top peeking mascot (Qiitan) */}
              <div className="pointer-events-none absolute -top-1 -left-2 opacity-0 translate-x-4 translate-y-2 transition-all duration-300 ease-out group-hover:opacity-100 group-hover:-translate-x-1 group-hover:-translate-y-4 group-hover:z-10" aria-hidden="true">
                <Image src="/qiitan.png" alt="Qiitan" width={100} height={100} className="h-10 w-10 -rotate-45" />
              </div>
              {/* Right-top peeking mascot (Gopher) */}
              <div className="pointer-events-none absolute -top-1 -right-2 opacity-0 -translate-x-4 translate-y-2 transition-all duration-300 ease-out group-hover:opacity-100 group-hover:translate-x-1 group-hover:-translate-y-4 group-hover:z-10" aria-hidden="true">
                <Image src="/gopher.png" alt="Gopher" width={100} height={100} className="h-10 w-10 rotate-45" />
              </div>
            </>
          )}
          <button
            className={`relative z-10 rounded-xl px-8 py-3 text-lg font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent ${canSubmit ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25 hover:from-blue-500 hover:to-indigo-500" : "bg-zinc-300 text-zinc-500 cursor-not-allowed"}`}
            disabled={!canSubmit}
            onClick={() => setConfirmOpen(true)}
          >
            決定
          </button>
        </div>
        {!canSubmit && submitBlockMessage && (
          <p className="mt-2 text-xs text-red-600">{submitBlockMessage}</p>
        )}
      </div>

      {/* 週カレンダー（灰色でbusy埋め） */}
      <section className="relative mt-6 rounded-2xl border border-white/20 bg-white/90 p-6 shadow-lg backdrop-blur animate-in fade-in-50">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-700"><CalendarClock className="h-4 w-4 text-zinc-500" /> カレンダー</h2>
          <div className="flex items-center gap-2">
            <button
              className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 transition hover:bg-zinc-50 disabled:opacity-50"
              onClick={() => setWeekStart(new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000))}
              disabled={weekStart.getTime() <= currentMonday.getTime()}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" /> 前の週
            </button>
            <div className="text-xs text-zinc-600">
              {`${weekStart.getMonth() + 1}/${weekStart.getDate()}(${weekdayName(weekStart)})`} 〜 {`${new Date(weekStart.getTime() + 6 * 86400000).getMonth() + 1}/${new Date(weekStart.getTime() + 6 * 86400000).getDate()}(${weekdayName(new Date(weekStart.getTime() + 6 * 86400000))})`}
            </div>
            <button
              className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 transition hover:bg-zinc-50 disabled:opacity-50"
              onClick={() => setWeekStart(new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000))}
              disabled={new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000) > oneMonthLater}
            >
              次の週 <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
        <p className="-mt-2 mb-3 text-xs text-zinc-600">30分枠をクリックで選択／同日の隣接時間枠をクリックで1時間以上の面談設定ができます</p>
        <div className="relative">
        {busyLoading && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-white/60 backdrop-blur-sm">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-600" />
          </div>
        )}
        <WeekGridComponent
          busy={busy}
          focusDate={weekStart}
          selectedStart={selectedStart}
          selectedEnd={selectedEnd}
          onSelectSlot={(slotStart: Date, slotEnd: Date) => {
            setYear(slotStart.getFullYear());
            setMonth(slotStart.getMonth() + 1);
            setDay(slotStart.getDate());

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
                  const endHourForUI = (slotEnd.getHours() === 0 && slotEnd.getDate() !== slotStart.getDate()) ? 24 : slotEnd.getHours();
                  setEndHour(endHourForUI);
                  setEndMin(endHourForUI === 24 ? 0 : slotEnd.getMinutes());
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
            const endHourForUI = (slotEnd.getHours() === 0 && slotEnd.getDate() !== slotStart.getDate()) ? 24 : slotEnd.getHours();
            setEndHour(endHourForUI);
            setEndMin(endHourForUI === 24 ? 0 : slotEnd.getMinutes());
          }}
        />
        </div>
      </section>

      {/* 確認モーダル（簡易） */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-3">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl max-h-[85vh]">
            <div className="flex items-center gap-2 border-b border-zinc-200 bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-3">
              <NotebookText className="h-5 w-5 text-white" aria-hidden="true" />
              <h3 className="text-base font-semibold text-white">最終確認</h3>
            </div>
            <div className="p-5 overflow-y-auto">
              <div className="grid gap-3 text-sm text-zinc-900 sm:grid-cols-2">
                <div className="rounded-lg bg-zinc-50 p-3">
                  <div className="text-xs text-zinc-500">日付</div>
                  <div className="mt-1 font-medium">{`${year ?? "XXXX"}年${padOrXX(month)}月${padOrXX(day)}日(${weekdayText || "X"})`}</div>
                </div>
                <div className="rounded-lg bg-zinc-50 p-3">
                  <div className="text-xs text-zinc-500">時間</div>
                  <div className="mt-1 font-medium">{formatTimeRange(startHour, startMin, endHour, endMin)}</div>
                </div>
                <div className="rounded-lg bg-zinc-50 p-3">
                  <div className="text-xs text-zinc-500">お名前(本名)</div>
                  <div className="mt-1 font-medium">{name || "(未入力)"}</div>
                </div>
                <div className="rounded-lg bg-zinc-50 p-3">
                  <div className="text-xs text-zinc-500">ご相談内容</div>
                  <div className="mt-1 font-medium">{purpose}</div>
                </div>
                <div className="rounded-lg bg-zinc-50 p-3 sm:col-span-2">
                  <div className="text-xs text-zinc-500">ご連絡手段（ミーティング媒体）</div>
                  <div className="mt-1 font-medium">
                    {contactMethod === "meet" ? "GoogleMeet" : contactMethod}
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
                {meetingNote && (
                  <div className="rounded-lg bg-zinc-50 p-3 sm:col-span-2">
                    <div className="text-xs text-zinc-500">ご相談詳細</div>
                    <div className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-800">{meetingNote}</div>
                  </div>
                )}
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
            <div className="text-sm text-zinc-700">予定を作成しています…</div>
          </div>
        </div>
      )}

      {/* 作成完了モーダル */}
      <CompletionModal
        createdInfo={createdInfo}
        contactMethod={contactMethod as "meet" | "discord" | "slack" | "other"}
        details={completedDetails ?? { year, month, day, weekday: weekdayText, startHour, startMin, endHour, endMin, name, purpose, email, discordName, slackName, otherNote, meetingNote }}
        onClose={() => {
                    setCreatedInfo(null);
                    setCompletedDetails(null);
                    if (typeof window !== "undefined") window.location.reload();
                  }}
      />

      {/* 取消機能は廃止 */}
    </main>
    </HeroBackground>
  );
}

function weekdayName(d: Date) {
  return ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

// Removed CalendarTodayHint (moved to header marquee)

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

// WeekGrid moved to feature/reserve/ui/WeekGrid

function padOrXX(n: number | null): string {
  if (n == null) return "XX";
  return pad(n);
}

function formatTimeRange(sh: number | null, sm: number | null, eh: number | null, em: number | null): string {
  if (sh == null || sm == null || eh == null || em == null) return "XX : XX ~ XX : XX";
  return `${pad(sh)} : ${pad(sm)} ~ ${pad(eh)} : ${pad(em)}`;
}

// moved to Zod schema validation


