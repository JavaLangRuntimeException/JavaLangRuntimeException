"use client";

import { atomWithStorage } from "jotai/utils";
import { createTTLStorage } from "../../shared/lib/ttlStorage";

const TEN_MINUTES_MS = 10 * 60 * 1000;
const ttlString = createTTLStorage<string>(TEN_MINUTES_MS);

export const contactEmailAtom = atomWithStorage<string>("contact_email", "", ttlString, { getOnInit: true });
export const contactNameAtom = atomWithStorage<string>("contact_name", "", ttlString, { getOnInit: true });
export const contactOrganizationAtom = atomWithStorage<string>("contact_organization", "", ttlString, { getOnInit: true });
export const contactSubjectAtom = atomWithStorage<string>("contact_subject", "", ttlString, { getOnInit: true });
export const contactPurposeAtom = atomWithStorage<string>("contact_purpose", "", ttlString, { getOnInit: true });
export const contactMessageAtom = atomWithStorage<string>("contact_message", "", ttlString, { getOnInit: true });
export const contactEventIdAtom = atomWithStorage<string>("contact_eventId", "", ttlString, { getOnInit: true });
