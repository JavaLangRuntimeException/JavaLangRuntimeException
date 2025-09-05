"use client";

import { atomWithStorage } from "jotai/utils";
import { createTTLStorage } from "../../shared/lib/ttlStorage";

const TEN_MINUTES_MS = 10 * 60 * 1000;
const ttlString = createTTLStorage<string>(TEN_MINUTES_MS);
const ttlContactMethod = createTTLStorage<"" | "meet" | "discord" | "slack" | "other">(TEN_MINUTES_MS);
const ttlNumberOrNull = createTTLStorage<number | null>(TEN_MINUTES_MS);

export const emailAtom = atomWithStorage<string>("reserve_email", "", ttlString, { getOnInit: true });
export const contactMethodAtom = atomWithStorage<"" | "meet" | "discord" | "slack" | "other">("reserve_contact_method", "", ttlContactMethod);
export const discordServerAtom = atomWithStorage<string>("reserve_discord_server", "", ttlString);
export const discordNameAtom = atomWithStorage<string>("reserve_discord_name", "", ttlString);
export const slackWorkspaceAtom = atomWithStorage<string>("reserve_slack_workspace", "", ttlString);
export const slackNameAtom = atomWithStorage<string>("reserve_slack_name", "", ttlString);
export const otherNoteAtom = atomWithStorage<string>("reserve_other_note", "", ttlString);
export const purposeAtom = atomWithStorage<string>("reserve_purpose", "", ttlString);
export const nameAtom = atomWithStorage<string>("reserve_name", "", ttlString, { getOnInit: true });

// Date/time selections
export const yearAtom = atomWithStorage<number | null>("reserve_year", new Date().getFullYear(), ttlNumberOrNull);
export const monthAtom = atomWithStorage<number | null>("reserve_month", null, ttlNumberOrNull);
export const dayAtom = atomWithStorage<number | null>("reserve_day", null, ttlNumberOrNull);
export const startHourAtom = atomWithStorage<number | null>("reserve_start_hour", null, ttlNumberOrNull);
export const startMinAtom = atomWithStorage<number | null>("reserve_start_min", null, ttlNumberOrNull);
export const endHourAtom = atomWithStorage<number | null>("reserve_end_hour", null, ttlNumberOrNull);
export const endMinAtom = atomWithStorage<number | null>("reserve_end_min", null, ttlNumberOrNull);

// Meeting note
export const meetingNoteAtom = atomWithStorage<string>("reserve_meeting_note", "", ttlString);


