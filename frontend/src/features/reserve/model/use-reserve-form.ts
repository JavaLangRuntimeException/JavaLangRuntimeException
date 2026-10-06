import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAtom, useSetAtom } from "jotai";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchBusy } from "@/entities/slot";
import { businessHoursFor, findNextAvailableSlot, formatDateKey, isOfflineHoursInvalid, isSelectionInvalid, oneMonthAfter, parseSlotText } from "@/entities/slot";
import { isAskMeUnavailableLocation, useWorkLocations } from "@/entities/work-location";
import { useResolvePlace } from "./use-resolve-place";
import { getMonday, isHolidayPeriod, isOverlappingBusy, weekdayName } from "@/shared/lib/busy";
import { reserveSubmittingAtom } from "@/shared/model/nav-lock";
import { createReservation, type CreatedInfo } from "../api/create-reservation";
import { contactErrors } from "./schema";
import * as S from "./state";
import type { ReservationDetails } from "./types";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** 週（月曜 0:00 の ISO）ごとの埋まっている時間 */
export const busyQueryKey = (weekIso: string) => ["busy", weekIso] as const;

/**
 * 予約ページの状態と振る舞い（旧 src/app/reserve/page.tsx と同じ規則・文言）。
 * 入力は jotai（10 分保持）、空き時間と勤務場所は TanStack Query
 */
export function useReserveForm() {
  const queryClient = useQueryClient();
  const now = useMemo(() => new Date(), []);
  const currentMonday = useMemo(() => getMonday(now), [now]);
  const oneMonthLater = useMemo(() => oneMonthAfter(now), [now]);
  const [weekStart, setWeekStart] = useState<Date>(currentMonday);
  const setSubmitting = useSetAtom(reserveSubmittingAtom);

  const [year, setYear] = useAtom(S.yearAtom);
  const [month, setMonth] = useAtom(S.monthAtom);
  const [day, setDay] = useAtom(S.dayAtom);
  const [startHour, setStartHour] = useAtom(S.startHourAtom);
  const [startMin, setStartMin] = useAtom(S.startMinAtom);
  const [endHour, setEndHour] = useAtom(S.endHourAtom);
  const [endMin, setEndMin] = useAtom(S.endMinAtom);
  const [name, setName] = useAtom(S.nameAtom);
  const [email, setEmail] = useAtom(S.emailAtom);
  const [purpose, setPurpose] = useAtom(S.purposeAtom);
  const [contactMethod, setContactMethod] = useAtom(S.contactMethodAtom);
  const [discordName, setDiscordName] = useAtom(S.discordNameAtom);
  const [discordServer, setDiscordServer] = useAtom(S.discordServerAtom);
  const [slackWorkspace, setSlackWorkspace] = useAtom(S.slackWorkspaceAtom);
  const [slackName, setSlackName] = useAtom(S.slackNameAtom);
  const [otherNote, setOtherNote] = useAtom(S.otherNoteAtom);
  const [offlinePlaceLink, setOfflinePlaceLink] = useAtom(S.offlinePlaceLinkAtom);
  const [offlinePlaceName, setOfflinePlaceName] = useAtom(S.offlinePlaceNameAtom);
  const [offlinePlaceDetail, setOfflinePlaceDetail] = useAtom(S.offlinePlaceDetailAtom);
  const [meetingNote, setMeetingNote] = useAtom(S.meetingNoteAtom);
  const [discordServerTouched, setDiscordServerTouched] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [decisionLocked, setDecisionLocked] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdInfo, setCreatedInfo] = useState<CreatedInfo>(null);
  const [completedDetails, setCompletedDetails] = useState<ReservationDetails | null>(null);
  // 完了画面のミーティング媒体（送信後に入力を消しても Meet の URL を出せるよう控える）
  const [completedMethod, setCompletedMethod] = useState<S.ContactMethod | null>(null);
  const [notify, setNotify] = useState("");
  const submitLockRef = useRef(false);

  // 表示中の週の埋まっている時間と、勤務場所
  const weekIso = weekStart.toISOString();
  const busyQuery = useQuery({ queryKey: busyQueryKey(weekIso), queryFn: () => fetchBusy(weekIso), staleTime: 60_000 });
  const busy = useMemo(() => busyQuery.data ?? [], [busyQuery.data]);
  const busyLoading = busyQuery.isPending;
  const locationsQuery = useWorkLocations();
  const locations = useMemo(() => locationsQuery.data ?? {}, [locationsQuery.data]);
  const locationsLoading = locationsQuery.isPending;

  const isResolvingPlace = useResolvePlace(offlinePlaceLink, contactMethod === "offline", setOfflinePlaceName);

  const hasDate = year != null && month != null && day != null;
  const hasTime = startHour != null && startMin != null && endHour != null && endMin != null;
  const at = (h: number | null, m: number | null) => (hasDate && hasTime ? new Date(year!, month! - 1, day!, h!, m!, 0, 0) : new Date(0));
  const selectedStart = at(startHour, startMin);
  const selectedEnd = at(endHour, endMin);

  const selectionInvalid = useMemo(() => {
    if (!hasDate || !hasTime) return false;
    const s = new Date(year!, month! - 1, day!, startHour!, startMin!);
    const e = new Date(year!, month! - 1, day!, endHour!, endMin!);
    return isSelectionInvalid(s, e, { now: Date.now(), oneMonthLater, contactMethod, locations, busy });
  }, [hasDate, hasTime, year, month, day, startHour, startMin, endHour, endMin, oneMonthLater, contactMethod, locations, busy]);

  const errors = useMemo(() => {
    const errs = contactErrors({
      name, email, purpose: purpose || "", contactMethod: contactMethod || "",
      discordServer, discordName, slackWorkspace, slackName, otherNote, offlinePlaceLink, offlinePlaceName, offlinePlaceDetail,
    });
    if (hasDate && hasTime) {
      const s = new Date(year!, month! - 1, day!, startHour!, startMin!);
      const e = new Date(year!, month! - 1, day!, endHour!, endMin!);
      if (!(e > s)) errs.time = "終了は開始より後にしてください";
    }
    return errs;
  }, [name, email, purpose, contactMethod, discordServer, discordName, slackWorkspace, slackName, otherNote, offlinePlaceLink, offlinePlaceName, offlinePlaceDetail, hasDate, hasTime, year, month, day, startHour, startMin, endHour, endMin]);

  const canSubmit = !locationsLoading && hasDate && hasTime && !selectionInvalid && Object.keys(errors).length === 0;
  const submitBlockMessage = locationsLoading
    ? "空き状況を確認中です"
    : !hasDate || !hasTime
      ? "日付と時間を選択してください"
      : Object.keys(errors).length > 0
        ? "入力内容をご確認ください"
        : selectionInvalid
          ? "ご指定の時間では予約できません"
          : "";

  const offlineHoursInvalid = contactMethod === "offline" && hasTime && isOfflineHoursInvalid(startHour!, startMin!, endHour!, endMin!);
  const weekday = hasDate ? weekdayName(new Date(year!, month! - 1, day!)) : "";

  // 直近の空き 30 分枠（最初に見つけた値を出し続ける。旧実装と同じ）
  const [slotLoading, setSlotLoading] = useState(true);
  const [nextSlotText, setNextSlotText] = useState("");
  const preservedSlotRef = useRef("");
  useEffect(() => {
    if (busyLoading || locationsLoading) return;
    let cancelled = false;
    const currentWeekKey = getMonday(weekStart).toISOString();
    setSlotLoading(true);
    findNextAvailableSlot({
      now: new Date(),
      oneMonthLater,
      hours: businessHoursFor(contactMethod),
      locations,
      busyForWeek: (key) => (key === currentWeekKey ? Promise.resolve(busy) : queryClient.fetchQuery({ queryKey: busyQueryKey(key), queryFn: () => fetchBusy(key), staleTime: 60_000 })),
    })
      .then((text) => {
        if (cancelled || !text) return;
        if (!preservedSlotRef.current) preservedSlotRef.current = text;
        setNextSlotText(text);
      })
      .finally(() => !cancelled && setSlotLoading(false));
    return () => {
      cancelled = true;
    };
  }, [busy, busyLoading, locations, locationsLoading, contactMethod, weekStart, oneMonthLater, queryClient]);
  const displayedSlotText = preservedSlotRef.current || nextSlotText;

  const applyNextAvailableSlot = useCallback(() => {
    const slot = parseSlotText(displayedSlotText);
    if (!slot) return;
    setYear(slot.year);
    setMonth(slot.month);
    setDay(slot.day);
    setStartHour(slot.startHour);
    setStartMin(slot.startMin);
    setEndHour(slot.endHour);
    setEndMin(slot.endMin);
    setWeekStart(getMonday(new Date(slot.year, slot.month - 1, slot.day)));
    setNotify(`予約日時を ${displayedSlotText} にセットしました`);
    setTimeout(() => setNotify(""), 3000);
  }, [displayedSlotText, setYear, setMonth, setDay, setStartHour, setStartMin, setEndHour, setEndMin]);

  // TechSelect+ の Discord 面談はサーバー名の既定を「Tech Select」にする
  useEffect(() => {
    if (contactMethod === "discord" && purpose === "TechSelect+" && !discordServerTouched && !discordServer.trim()) {
      setDiscordServer("Tech Select");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactMethod, purpose]);

  // 選べる年・月（今月と来月）
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const yearOptions = useMemo(() => (currentMonth === 12 ? [currentYear, currentYear + 1] : [currentYear]), [currentYear, currentMonth]);
  const monthOptions = useMemo(() => (currentMonth === 12 ? [12, 1] : [currentMonth, currentMonth + 1]), [currentMonth]);
  useEffect(() => {
    if (month == null || !monthOptions.includes(month)) setMonth(monthOptions[0] ?? null);
  }, [month, monthOptions, setMonth]);

  /** 週カレンダーのマスを押したとき。同じ日の隣の枠なら 1 時間以上に伸ばす */
  const selectSlot = (slotStart: Date, slotEnd: Date) => {
    setYear(slotStart.getFullYear());
    setMonth(slotStart.getMonth() + 1);
    setDay(slotStart.getDate());
    if (hasDate && hasTime) {
      const curStart = new Date(year!, month! - 1, day!, startHour!, startMin!, 0, 0);
      const curEnd = new Date(year!, month! - 1, day!, endHour!, endMin!, 0, 0);
      const sameDay = curStart.getFullYear() === slotStart.getFullYear() && curStart.getMonth() === slotStart.getMonth() && curStart.getDate() === slotStart.getDate();
      if (sameDay && curEnd > curStart) {
        if (slotStart.getTime() === curEnd.getTime()) {
          setEndHour(slotEnd.getHours());
          setEndMin(slotEnd.getMinutes());
          return;
        }
        if (slotEnd.getTime() === curStart.getTime()) {
          setStartHour(slotStart.getHours());
          setStartMin(slotStart.getMinutes());
          return;
        }
      }
    }
    setStartHour(slotStart.getHours());
    setStartMin(slotStart.getMinutes());
    setEndHour(slotEnd.getHours());
    setEndMin(slotEnd.getMinutes());
  };

  const openConfirm = () => {
    if (!canSubmit || decisionLocked || confirmOpen) return;
    setDecisionLocked(true);
    setConfirmOpen(true);
    setTimeout(() => setDecisionLocked(false), 400);
  };

  const details: ReservationDetails = {
    year, month, day, weekday, startHour, startMin, endHour, endMin, name, purpose, email, discordName, slackName, otherNote,
    offlinePlaceLink, offlinePlaceName, offlinePlaceDetail, meetingNote,
  };

  const resetAfterSuccess = () => {
    try {
      S.RESERVE_STORAGE_KEYS.forEach((k) => window.localStorage.removeItem(k));
    } catch {
      // ストレージが使えない環境は無視
    }
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
    setYear(null);
    setMonth(null);
    setDay(null);
    setStartHour(null);
    setStartMin(null);
    setEndHour(null);
    setEndMin(null);
  };

  async function submit() {
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setConfirmOpen(false);
    setCreating(true);
    setSubmitting(true);
    const stop = (message?: string) => {
      if (message) alert(message);
      submitLockRef.current = false;
      setCreating(false);
      setSubmitting(false);
    };

    if (!hasDate || !hasTime) return stop("日付と時間を選択してください");
    const nowTs = Date.now();
    if (Object.keys(contactErrors({ name, email, purpose: purpose || "", contactMethod: contactMethod || "", discordServer, discordName, slackWorkspace, slackName, otherNote, offlinePlaceLink, offlinePlaceName, offlinePlaceDetail })).length > 0) {
      return stop();
    }
    const startDate = new Date(year!, month! - 1, day!, startHour!, startMin!);
    const endDate = new Date(year!, month! - 1, day!, endHour!, endMin!);
    if (startDate.getTime() <= nowTs) return stop("過去の時間は選択できません");
    if (startDate.getTime() < nowTs + 2 * 60 * 60 * 1000) return stop("現在時刻から2時間後以降のみ予約できます");
    if (!(endDate > startDate)) return stop("終了は開始より後にしてください");
    if (isHolidayPeriod(startDate) || isAskMeUnavailableLocation(locations[formatDateKey(startDate)])) return stop("ご指定の日は予約できません");

    // 直前の空き確認（同時に予約が入った場合に備える）
    const weekKey = getMonday(startDate).toISOString();
    const latest = await fetchBusy(weekKey);
    if (isOverlappingBusy(startDate, endDate, latest)) {
      queryClient.setQueryData(busyQueryKey(weekKey), latest);
      return stop("直前に同時間帯の予約が入りました。別の時間をお選びください");
    }
    if (isOverlappingBusy(startDate, endDate, busy)) return stop("選択した時間帯は不可です");

    try {
      const result = await createReservation({
        year: year!, month: month!, day: day!, weekday,
        start: { hour: startHour!, minute: startMin! },
        end: { hour: endHour!, minute: endMin! },
        name, email, purpose, contactMethod,
        discordName: contactMethod === "discord" ? discordName.trim() : undefined,
        discordServer: contactMethod === "discord" ? discordServer.trim() : undefined,
        slackName: contactMethod === "slack" ? slackName.trim() : undefined,
        slackWorkspace: contactMethod === "slack" ? slackWorkspace.trim() : undefined,
        otherNote: contactMethod === "other" ? otherNote.trim() : undefined,
        offlinePlaceLink: contactMethod === "offline" ? (offlinePlaceLink || "").trim() : undefined,
        offlinePlaceName: contactMethod === "offline" ? (offlinePlaceName || "").trim() : undefined,
        offlinePlaceDetail: contactMethod === "offline" ? (offlinePlaceDetail || "").trim() : undefined,
        meetingNote: meetingNote.trim() || undefined,
      });
      // 入力を消す前に、完了画面に出す内容を控える
      if (result.ok) {
        setCompletedDetails(details);
        setCompletedMethod(contactMethod);
      }
      setCreatedInfo(result);
      if (result.ok) resetAfterSuccess();
    } finally {
      setCreating(false);
      setSubmitting(false);
      submitLockRef.current = false;
    }
  }

  return {
    // 値
    now, currentMonday, oneMonthLater, weekStart, setWeekStart,
    year, month, day, startHour, startMin, endHour, endMin, weekday,
    setYear, setMonth, setDay, setStartHour, setStartMin, setEndHour, setEndMin,
    name, setName, email, setEmail, purpose, setPurpose, meetingNote, setMeetingNote,
    contactMethod, setContactMethod, discordServer, setDiscordServer, setDiscordServerTouched, discordName, setDiscordName,
    slackWorkspace, setSlackWorkspace, slackName, setSlackName, otherNote, setOtherNote,
    offlinePlaceLink, setOfflinePlaceLink, offlinePlaceName, offlinePlaceDetail, setOfflinePlaceDetail, isResolvingPlace,
    busy, busyLoading, locations,
    selectedStart, selectedEnd, selectionInvalid: hasDate && hasTime && selectionInvalid, offlineHoursInvalid,
    errors, canSubmit, submitBlockMessage, yearOptions, monthOptions,
    slotLoading, displayedSlotText, applyNextAvailableSlot, notify,
    // 送信
    confirmOpen, setConfirmOpen, decisionLocked, openConfirm, creating, submit,
    createdInfo, completedDetails, details, completedMethod: completedMethod ?? contactMethod,
    closeCompletion: () => {
      setCreatedInfo(null);
      setCompletedDetails(null);
      setCompletedMethod(null);
      window.location.reload();
    },
    selectSlot,
    weekMs: WEEK_MS,
  };
}
