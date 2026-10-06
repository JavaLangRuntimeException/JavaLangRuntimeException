import { atomWithStorage } from "jotai/utils";
import { createTTLStorage } from "@/shared/lib/ttl-storage";

// 予約フォームの入力は 10 分だけブラウザに残す（キー名・保持時間は旧実装 src/feature/reserve/state.ts と同じ）
export type ContactMethod = "" | "meet" | "discord" | "slack" | "other" | "offline";

const TEN_MINUTES_MS = 10 * 60 * 1000;
const ttlString = createTTLStorage<string>(TEN_MINUTES_MS);
const ttlContactMethod = createTTLStorage<ContactMethod>(TEN_MINUTES_MS);
const ttlNumberOrNull = createTTLStorage<number | null>(TEN_MINUTES_MS);

export const emailAtom = atomWithStorage<string>("reserve_email", "", ttlString, { getOnInit: true });
export const contactMethodAtom = atomWithStorage<ContactMethod>("reserve_contact_method", "", ttlContactMethod);
export const discordServerAtom = atomWithStorage<string>("reserve_discord_server", "", ttlString, { getOnInit: true });
export const discordNameAtom = atomWithStorage<string>("reserve_discord_name", "", ttlString, { getOnInit: true });
export const slackWorkspaceAtom = atomWithStorage<string>("reserve_slack_workspace", "", ttlString, { getOnInit: true });
export const slackNameAtom = atomWithStorage<string>("reserve_slack_name", "", ttlString, { getOnInit: true });
export const otherNoteAtom = atomWithStorage<string>("reserve_other_note", "", ttlString);
export const offlinePlaceLinkAtom = atomWithStorage<string>("reserve_offline_place_link", "", ttlString);
export const offlinePlaceNameAtom = atomWithStorage<string>("reserve_offline_place_name", "", ttlString);
export const offlinePlaceDetailAtom = atomWithStorage<string>("reserve_offline_place_detail", "", ttlString);
export const purposeAtom = atomWithStorage<string>("reserve_purpose", "", ttlString);
export const nameAtom = atomWithStorage<string>("reserve_name", "", ttlString, { getOnInit: true });

// 日付・時間の選択
export const yearAtom = atomWithStorage<number | null>("reserve_year", new Date().getFullYear(), ttlNumberOrNull);
export const monthAtom = atomWithStorage<number | null>("reserve_month", null, ttlNumberOrNull);
export const dayAtom = atomWithStorage<number | null>("reserve_day", null, ttlNumberOrNull);
export const startHourAtom = atomWithStorage<number | null>("reserve_start_hour", null, ttlNumberOrNull);
export const startMinAtom = atomWithStorage<number | null>("reserve_start_min", null, ttlNumberOrNull);
export const endHourAtom = atomWithStorage<number | null>("reserve_end_hour", null, ttlNumberOrNull);
export const endMinAtom = atomWithStorage<number | null>("reserve_end_min", null, ttlNumberOrNull);

// ご相談詳細
export const meetingNoteAtom = atomWithStorage<string>("reserve_meeting_note", "", ttlString);

/** 予約に成功したら次回以降の自動保存を消す（旧実装と同じキー） */
export const RESERVE_STORAGE_KEYS = [
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
] as const;
