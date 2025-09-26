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
import { ConfirmModal } from "../../feature/reserve/ui/ConfirmModal";
import { useAtom } from "jotai";
import { Info, ChevronLeft, ChevronRight, CalendarClock } from "lucide-react";
import {
  emailAtom,
  contactMethodAtom,
  discordServerAtom,
  discordNameAtom,
  slackWorkspaceAtom,
  slackNameAtom,
  otherNoteAtom,
  offlinePlaceLinkAtom,
  offlinePlaceNameAtom,
  offlinePlaceDetailAtom,
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
  const [decisionLocked, setDecisionLocked] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [createdInfo, setCreatedInfo] = React.useState<{ ok: boolean; eventId?: string; htmlLink?: string; meetLink?: string } | null>(null);
  const [contactMethod, setContactMethod] = useAtom(contactMethodAtom);
  const [discordName, setDiscordName] = useAtom(discordNameAtom);
  const [slackName, setSlackName] = useAtom(slackNameAtom);
  const [otherNote, setOtherNote] = useAtom(otherNoteAtom);
  const [offlinePlaceLink, setOfflinePlaceLink] = useAtom(offlinePlaceLinkAtom);
  const [offlinePlaceName, setOfflinePlaceName] = useAtom(offlinePlaceNameAtom);
  const [offlinePlaceDetail, setOfflinePlaceDetail] = useAtom(offlinePlaceDetailAtom);
  const [discordServer, setDiscordServer] = useAtom(discordServerAtom);
  const [discordServerTouched, setDiscordServerTouched] = React.useState(false);
  const [slackWorkspace, setSlackWorkspace] = useAtom(slackWorkspaceAtom);
  const [meetingNote, setMeetingNote] = useAtom(meetingNoteAtom);
  const [isResolvingPlace, setIsResolvingPlace] = React.useState(false);
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
    offlinePlaceLink?: string;
    offlinePlaceName?: string;
    offlinePlaceDetail?: string;
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
    // Offline business hours constraint (10:00 - 21:00) using UI values (24:00 supported)
    if (contactMethod === "offline") {
      const sh = startHour as number;
      const sm = startMin as number;
      const eh = endHour as number;
      const em = endMin as number;
      const sMinsUI = sh * 60 + sm;
      const eMinsUI = (eh === 24 ? 24 * 60 : eh * 60 + em);
      const allow = sMinsUI >= 10 * 60 && eMinsUI <= 21 * 60;
      if (!allow) return true;
    }
    if (isOverlappingBusy(s, e, busy)) return true;
    return false;
  }, [hasDate, hasTime, year, month, day, startHour, startMin, endHour, endMin, busy, oneMonthLater, contactMethod]);

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
      offlinePlaceLink,
      offlinePlaceName,
      offlinePlaceDetail,
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
  }, [name, email, purpose, contactMethod, discordServer, discordName, slackWorkspace, slackName, otherNote, offlinePlaceLink, offlinePlaceName, offlinePlaceDetail, hasDate, hasTime, year, month, day, startHour, startMin, endHour, endMin]);

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

  const [slotSuggestLoading, setSlotSuggestLoading] = React.useState(true);
  const [nextAvailableSlotText, setNextAvailableSlotText] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    async function computeNextAvailable() {
      try {
        setSlotSuggestLoading(true);
        setNextAvailableSlotText("");
        // Ensure we use the same busy source as the calendar for the current week
        if (busyLoading) {
          return;
        }
        const cache = new Map<string, { start: string; end: string }[]>();
        const stepMs = 30 * 60 * 1000;
        const business = contactMethod === "offline" ? { start: 10, end: 21 } : { start: 9, end: 24 };
        const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), business.start, 0, 0, 0);
        const dayEnd = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), business.end, 0, 0, 0);
        const getMonday = (d: Date) => {
          const date = new Date(d);
          const day = date.getDay();
          const diff = (day === 0 ? -6 : 1) - day;
          date.setDate(date.getDate() + diff);
          date.setHours(0, 0, 0, 0);
          return date;
        };
        const align = (d: Date) => {
          const t = new Date(d);
          const m = t.getMinutes();
          if (m > 0 && m <= 30) t.setMinutes(30, 0, 0);
          else if (m > 30) { t.setHours(t.getHours() + 1, 0, 0, 0); } else { t.setSeconds(0, 0); }
          return t;
        };
        const now2h = new Date(Date.now() + 2 * 60 * 60 * 1000);
        let t = align(now2h);
        if (t < dayStart(t)) t = dayStart(t);
        if (t >= dayEnd(t)) t = dayStart(new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1));

        async function fetchBusyFor(date: Date) {
          const monday = getMonday(date);
          const key = monday.toISOString();
          // Prefer already-loaded busy when same week as current calendar view
          const currentWeekKey = getMonday(weekStart).toISOString();
          if (key === currentWeekKey) return busy;
          if (cache.has(key)) return cache.get(key)!;
          const d = await fetch("/api/ical/busy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ weekStartISO: key }),
          }).then((r) => r.json()).catch(() => ({ busy: [] }));
          const arr: { start: string; end: string }[] = d?.busy || [];
          cache.set(key, arr);
          return arr;
        }

        let guard = 0;
        while (guard < 2000 && t.getTime() <= oneMonthLater.getTime()) {
          // Clamp to business start (09:00) if before business hours
          if (t < dayStart(t)) {
            t = dayStart(t);
            guard += 1;
            continue;
          }
          const end = new Date(t.getTime() + stepMs);
          if (end > dayEnd(t)) {
            t = dayStart(new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1));
            guard += 1;
            continue;
          }
          const weekBusy = await fetchBusyFor(t);
          if (!isOverlappingBusy(t, end, weekBusy)) {
            const endIsMidnightOfNextDay = end.getHours() === 0 && end.getDate() !== t.getDate();
            const endHourDisplay = endIsMidnightOfNextDay ? "24" : pad(end.getHours());
            const endMinuteDisplay = endIsMidnightOfNextDay ? "00" : pad(end.getMinutes());
            const text = `${t.getFullYear()}/${pad(t.getMonth() + 1)}/${pad(t.getDate())}(${weekdayName(t)}) ${pad(t.getHours())}:${pad(t.getMinutes())}〜${endHourDisplay}:${endMinuteDisplay}`;
            if (!cancelled) setNextAvailableSlotText(text);
            break;
          }
          t = end;
          guard += 1;
        }
      } finally {
        if (!cancelled) setSlotSuggestLoading(false);
      }
    }
    computeNextAvailable();
    return () => { cancelled = true; };
  }, [oneMonthLater, weekStart, busy, busyLoading, contactMethod]);

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
    const ehRaw = Number(m[6]);
    const em = Number(m[7]);
    const eh = ehRaw === 0 ? 24 : ehRaw;
    setYear(y);
    setMonth(mo);
    setDay(d);
    setStartHour(sh);
    setStartMin(sm);
    setEndHour(eh);
    setEndMin(eh === 24 ? 0 : em);
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
      offlinePlaceLink,
      offlinePlaceName,
      offlinePlaceDetail,
    },
  });

  const watchedName = watch("name");

  React.useEffect(() => {
    const sub = watch((v: Partial<ContactForm>) => {
      if (!v) return;
      if (typeof v.name === "string") setName(v.name);
      if (typeof v.email === "string") setEmail(v.email);
      if (v.contactMethod) setContactMethod(v.contactMethod);
      if (typeof v.discordServer === "string") setDiscordServer(v.discordServer);
      if (typeof v.discordName === "string") setDiscordName(v.discordName);
      if (typeof v.slackWorkspace === "string") setSlackWorkspace(v.slackWorkspace);
      if (typeof v.slackName === "string") setSlackName(v.slackName);
      if (typeof v.otherNote === "string") setOtherNote(v.otherNote);
      const vv = v as Partial<ContactForm> & { offlinePlaceLink?: string; offlinePlaceName?: string; offlinePlaceDetail?: string };
      if (typeof vv.offlinePlaceLink === "string") setOfflinePlaceLink(vv.offlinePlaceLink);
      if (typeof vv.offlinePlaceName === "string") setOfflinePlaceName(vv.offlinePlaceName);
      if (typeof vv.offlinePlaceDetail === "string") setOfflinePlaceDetail(vv.offlinePlaceDetail);
    });
    return () => sub.unsubscribe();
  }, [watch, setName, setEmail, setContactMethod, setDiscordServer, setDiscordName, setSlackWorkspace, setSlackName, setOtherNote, setOfflinePlaceLink, setOfflinePlaceName, setOfflinePlaceDetail]);

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
  React.useEffect(() => { setValue("offlinePlaceLink", offlinePlaceLink, { shouldValidate: contactMethod === "offline" }); }, [offlinePlaceLink, contactMethod, setValue]);
  React.useEffect(() => { setValue("offlinePlaceName", offlinePlaceName, { shouldValidate: contactMethod === "offline" }); }, [offlinePlaceName, contactMethod, setValue]);
  React.useEffect(() => { setValue("offlinePlaceDetail", offlinePlaceDetail, { shouldValidate: false }); }, [offlinePlaceDetail, setValue, setOfflinePlaceDetail]);

  // Auto-fill place name from Google Maps link (editable by user)
  React.useEffect(() => {
    if (contactMethod !== "offline") return;
    const link = (offlinePlaceLink || "").trim();
    if (!link) {
      // Clear when link is empty
      if (offlinePlaceName) setOfflinePlaceName("");
      return;
    }
    // Resolve server-side to follow short links and parse title/meta
    setIsResolvingPlace(true);
    fetch("/api/maps/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: link })
    })
      .then((r) => r.json())
      .then((d) => {
        // If failed or no name inferred, clear the field
        if (!d || !d.name) {
          if (offlinePlaceName) setOfflinePlaceName("");
          return;
        }
        const inferred: string = d.name;
        // Always set inferred as this field is auto-filled only
        setOfflinePlaceName(inferred);
      })
      .catch(() => {
        // On network/resolve error, clear the field
        if (offlinePlaceName) setOfflinePlaceName("");
      })
      .finally(() => setIsResolvingPlace(false));
  }, [contactMethod, offlinePlaceLink, offlinePlaceName, setOfflinePlaceName]);

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

  const submitLockRef = React.useRef(false);
  // Flag for offline-hours specific invalid state
  const offlineHoursInvalid = React.useMemo(() => {
    if (contactMethod !== "offline") return false;
    if (!hasTime) return false;
    const sh = startHour as number;
    const sm = startMin as number;
    const eh = endHour as number;
    const em = endMin as number;
    const sMins = sh * 60 + sm;
    const eMins = (eh === 24 ? 24 * 60 : eh * 60 + em);
    return !(sMins >= 10 * 60 && eMins <= 21 * 60 && eMins > sMins);
  }, [contactMethod, hasTime, startHour, startMin, endHour, endMin]);


  async function handleSubmit() {
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    // validation: start < end
    if (!hasDate || !hasTime) {
      alert("日付と時間を選択してください");
      submitLockRef.current = false;
      return;
    }
    // 過去は不可
    const nowTs = Date.now();
    // 2時間以内は不可
    const minStartTs = nowTs + 2 * 60 * 60 * 1000;
    const ok = await trigger();
    if (!ok) { submitLockRef.current = false; return; }
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
    // Just-in-time availability re-check to mitigate race conditions
    try {
      const weekToCheck = getMonday(startDate);
      const latest = await fetch("/api/ical/busy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStartISO: weekToCheck.toISOString() }),
      }).then((r) => r.json()).catch(() => ({ busy: [] }));
      const latestBusy: { start: string; end: string }[] = latest?.busy || [];
      if (isOverlappingBusy(startDate, endDate, latestBusy)) {
        alert("直前に同時間帯の予約が入りました。別の時間をお選びください");
        // refresh current busy state for UI feedback
        setBusy(latestBusy);
        submitLockRef.current = false;
        return;
      }
    } catch {}
    // Local cached check as fallback
    if (isOverlappingBusy(startDate, endDate, busy)) {
      alert("選択した時間帯は不可です");
      submitLockRef.current = false;
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
      offlinePlaceLink: contactMethod === "offline" ? (offlinePlaceLink || "").trim() : undefined,
      offlinePlaceName: contactMethod === "offline" ? (offlinePlaceName || "").trim() : undefined,
      offlinePlaceDetail: contactMethod === "offline" ? (offlinePlaceDetail || "").trim() : undefined,
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
          offlinePlaceLink,
          offlinePlaceName,
          offlinePlaceDetail,
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
      submitLockRef.current = false;
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
      <input type="hidden" {...register("offlinePlaceLink")} value={offlinePlaceLink} readOnly />
      <input type="hidden" {...register("offlinePlaceName")} value={offlinePlaceName} readOnly />
      <input type="hidden" {...register("offlinePlaceDetail")} value={offlinePlaceDetail} readOnly />
      <motion.h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent drop-shadow" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        お打ち合わせ予約
      </motion.h1>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-white/80 flex-1">
          お問い合わせはメール(<a className="underline" href="mailto:tanahashishuta@gmail.com">tanahashishuta@gmail.com</a>)またはX(<a className="underline" href="https://x.com/JavaLangRuntime" target="_blank" rel="noreferrer">@JavaLangRuntime</a>)でも承っております
        </p>
        <div className="flex flex-col items-end">
          <div className={`relative inline-block ${canSubmit ? "sm:group" : ""}`}>
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
              disabled={!canSubmit || decisionLocked || confirmOpen}
              onClick={() => {
                if (!canSubmit || decisionLocked || confirmOpen) return;
                setDecisionLocked(true);
                setConfirmOpen(true);
                setTimeout(() => setDecisionLocked(false), 400);
              }}
            >
              決定
            </button>
          </div>
          {!canSubmit && submitBlockMessage && (
            <p className="mt-1 text-xs text-red-600">{submitBlockMessage}</p>
          )}
        </div>
      </div>

      {/* 入力保持の案内 */}
      <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] text-white/80 backdrop-blur">
        <span className="h-2 w-2 rounded-full bg-emerald-400/80" /> 入力内容は10分間保持されます
      </p>

      {slotSuggestLoading ? (
        <div className="mt-4 sm:mt-6">
          <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur animate-in fade-in-50">
            <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-blue-400 to-indigo-500" />
            <div className="ml-3 flex items-center justify-between gap-3">
              <Info className="mt-0.5 h-5 w-5 text-blue-300" aria-hidden="true" />
              <p className="m-0 flex-1 text-sm text-white/90">直近相談予約可能時間(30分枠): <span className="font-semibold text-white">読み込み中...</span></p>
            </div>
          </div>
        </div>
      ) : (
        nextAvailableSlotText && (
          <div className="mt-4 sm:mt-6">
            <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur animate-in fade-in-50">
              <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-blue-400 to-indigo-500" />
              <div className="ml-3 flex items-center justify-between gap-3">
                <Info className="mt-0.5 h-5 w-5 text-blue-300" aria-hidden="true" />
                <p className="m-0 flex-1 text-sm text-white/90">直近相談予約可能時間(30分枠): <span className="font-semibold text-white">{nextAvailableSlotText}</span></p>
                <button
                  type="button"
                  onClick={applyNextAvailableSlot}
                  className="shrink-0 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  最短での時間指定(30分枠)
                </button>
              </div>
            </div>
            {notify && (
              <AlertBanner className="mt-2" message={notify} variant="success" />
            )}
          </div>
        )
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
          {contactMethod === "offline" && (
            <div className="mt-2 rounded-md bg-amber-50 p-2 text-[12px] text-amber-900">
              オフライン面談の予約可能時間は 10:00 - 21:00 です。
            </div>
          )}
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

      {/*ミーティング媒体（ミーティング媒体）（ミーティング媒体）を横長で下に配置 */}
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
          offlinePlaceLink={offlinePlaceLink}
          setOfflinePlaceLink={setOfflinePlaceLink}
          offlinePlaceName={offlinePlaceName}
          setOfflinePlaceName={setOfflinePlaceName}
          offlinePlaceDetail={offlinePlaceDetail}
          setOfflinePlaceDetail={setOfflinePlaceDetail}
          isResolvingPlace={isResolvingPlace}
          errors={{
            contactMethod: formErrors.contactMethod,
            discordServer: formErrors.discordServer,
            discordName: formErrors.discordName,
            slackWorkspace: formErrors.slackWorkspace,
            slackName: formErrors.slackName,
            email: formErrors.email,
            offlinePlaceLink: formErrors.offlinePlaceLink,
            offlinePlaceName: formErrors.offlinePlaceName,
          }}
          renderEmail={false}
        />
        {contactMethod === "offline" && (
          <div className="sm:col-span-2">
            <div className="rounded-md bg-amber-50 p-2 text-[12px] text-amber-900">
              オフライン面談の予約可能時間は 10:00 - 21:00 です。
            </div>
          </div>
        )}
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
        disabled={busyLoading}
        offlineHoursInvalid={offlineHoursInvalid}
      />


      {/* 週カレンダー（灰色でbusy埋め） */}
      <section className="relative mt-6 rounded-2xl border border-white/20 bg-white/90 p-6 shadow-lg backdrop-blur animate-in fade-in-50">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-700">
            <CalendarClock className="h-4 w-4 text-zinc-500" />
            <span className="whitespace-nowrap">カレンダー</span>
          </h2>
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
          businessHours={contactMethod === "offline" ? { start: 10, end: 21 } : { start: 9, end: 24 }}
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

      {/* カレンダーの仕様（カレンダーの下に詳細説明） */}
      <section className="mt-2">
        <div className="rounded-2xl border border-white/20 bg-white/90 p-4 shadow-lg backdrop-blur animate-in fade-in-50">
          <h3 className="mb-2 text-sm font-semibold text-zinc-700">カレンダーの仕様</h3>
          <ul className="list-disc space-y-1 pl-5 text-xs text-zinc-600">
            <li>週表示（前の週/次の週で移動、最大1ヶ月先まで）</li>
            <li>9:00〜24:00の30分単位で選択できます</li>
            <li>現在時刻から2時間以内と過去、埋まっている時間は選択不可です</li>
            <li>30分枠をクリックで選択、同日の隣接枠をクリックすると面談時間を延長できます</li>
            <li>選択中の枠は青色表示、選択不可の枠はグレー表示になります</li>
            <li>24:00は翌日0:00を指し、分は00固定になります</li>
          </ul>
        </div>
      </section>

      {/* 確認モーダル（簡易） */}
      {confirmOpen && (
        <ConfirmModal
          onClose={() => setConfirmOpen(false)}
          onSubmit={handleSubmit}
          submitting={creating}
          calendarLoading={busyLoading}
          details={{
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
            contactMethod: (contactMethod || "") as "meet" | "discord" | "slack" | "other" | "offline" | "",
            discordName,
            slackName,
            otherNote,
            email,
            offlinePlaceLink,
            offlinePlaceName,
            offlinePlaceDetail,
            meetingNote,
          }}
        />
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
        contactMethod={contactMethod as "meet" | "discord" | "slack" | "other" | "offline"}
        details={completedDetails ?? { year, month, day, weekday: weekdayText, startHour, startMin, endHour, endMin, name, purpose, email, discordName, slackName, otherNote, offlinePlaceLink, offlinePlaceName, offlinePlaceDetail, meetingNote }}
        calendarLoading={busyLoading}
        onClose={() => {
                    setCreatedInfo(null);
                    setCompletedDetails(null);
                    if (typeof window !== "undefined") window.location.reload();
                  }}
      />

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



