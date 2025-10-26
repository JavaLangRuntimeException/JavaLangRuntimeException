export const runtime = "nodejs";
import { NextResponse } from "next/server";

type BusyRequest = {
  weekStartISO: string; // Monday 00:00 ISO
};

type BusyInterval = { start: string; end: string };

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const debug = url.searchParams.get("debug") === "1";
    // Bodyが空の場合があるため安全にパース
    let body: BusyRequest | null = null;
    try {
      body = (await req.json()) as BusyRequest;
    } catch {}
    const fromQuery = url.searchParams.get("weekStartISO");
    const defaultMonday = (() => {
      const now = new Date();
      const day = now.getDay();
      const diff = (day === 0 ? -6 : 1) - day; // Monday as start
      const d = new Date(now);
      d.setDate(d.getDate() + diff);
      d.setHours(0, 0, 0, 0);
      return d;
    })();
    const weekStart = new Date((body && body.weekStartISO) || fromQuery || defaultMonday.toISOString());
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Build URL list only from environment variables
    let urls: string[] = [];
    const csv = process.env.ICAL_URLS || ""; // optional comma-separated
    if (csv.trim()) {
      urls = csv.split(/\s*,\s*/).filter(Boolean);
    } else {
      const envUrls: string[] = [];
      for (let i = 1; i <= 19; i++) {
        const v = process.env[`ICAL_URL_${i}`];
        if (v && v.trim()) envUrls.push(v.trim());
      }
      urls = envUrls;
    }
    urls = urls.map((u) => u.replace(/^webcal:\/\//i, "https://"));
    const results = await Promise.all(urls.map((u) => safeFetchText(u)));
    const texts = results.map((r) => r.text);
    const intervals = texts.flatMap((t) => parseIcsBusyIntervals(t, { windowStart: weekStart, windowEnd: weekEnd }));

    // Add 30-minute buffer before/after each busy interval, clip to the requested week, then merge overlaps
    const bufferMs = 30 * 60 * 1000;
    const clipped = intervals
      .map((iv) => {
        const s = new Date(new Date(iv.start).getTime() - bufferMs);
        const e = new Date(new Date(iv.end).getTime() + bufferMs);
        return {
          start: new Date(Math.max(s.getTime(), weekStart.getTime())),
          end: new Date(Math.min(e.getTime(), weekEnd.getTime())),
        };
      })
      .filter((iv) => iv.end > iv.start);

    const merged = mergeIntervals(clipped);
    const payload: BusyInterval[] = merged.map((iv) => ({ start: iv.start.toISOString(), end: iv.end.toISOString() }));
    if (debug) {
      return NextResponse.json({
        busy: payload,
        sourceCount: urls.length,
        sources: urls.map((u, i) => ({
          url: u,
          ok: results[i].ok,
          status: results[i].status,
          length: results[i].text.length,
        })),
      });
    }
    return NextResponse.json({ busy: payload });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ busy: [] }, { status: 200 });
  }
}

async function safeFetchText(url: string): Promise<{ ok: boolean; status: number; text: string }> {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        // Some calendar hosts reject generic serverless UAs; emulate a browser UA and accept iCal content
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        Accept: "text/calendar, text/plain, */*",
      },
    });
    if (!res.ok) return { ok: false, status: res.status, text: "" };
    const text = await res.text();
    return { ok: true, status: res.status, text };
  } catch {
    return { ok: false, status: 0, text: "" };
  }
}

function parseIcsBusyIntervals(
  ics: string,
  opts?: { windowStart?: Date; windowEnd?: Date }
): { start: string; end: string }[] {
  if (!ics) return [];
  // Unfold lines: lines beginning with space or tab are continuations
  const rawLines = ics.split(/\r?\n/);
  const lines: string[] = [];
  for (const raw of rawLines) {
    if (!raw) continue;
    if (/^[ \t]/.test(raw) && lines.length > 0) {
      lines[lines.length - 1] += raw.replace(/^[ \t]/, "");
    } else {
      lines.push(raw);
    }
  }

  type EventAcc = {
    dtstart?: string;
    dtend?: string;
    duration?: string;
    rrule?: string;
    exdate?: string[];
    transp?: string;
  };
  const events: EventAcc[] = [];
  let current: EventAcc | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "BEGIN:VEVENT") {
      current = {};
    } else if (line === "END:VEVENT") {
      if (current?.dtstart) {
        // Skip events with TRANSP:TRANSPARENT (free/available time, regardless of all-day or not)
        if (current.transp && current.transp.toUpperCase() === "TRANSPARENT") {
          current = null;
          continue;
        }
        // If DTEND is missing but DURATION exists, synthesize DTEND
        if (!current.dtend && current.duration) {
          const startIso = icsToISO(current.dtstart);
          const durMs = parseIcsDurationToMs(current.duration);
          if (startIso && durMs > 0) {
            const endIso = new Date(new Date(startIso).getTime() + durMs).toISOString();
            events.push({ dtstart: startIso, dtend: endIso, rrule: current.rrule, exdate: current.exdate });
          } else if (startIso) {
            // Fallback: treat as 30-min event if duration unparseable
            const endIso = new Date(new Date(startIso).getTime() + 30 * 60 * 1000).toISOString();
            events.push({ dtstart: startIso, dtend: endIso, rrule: current.rrule, exdate: current.exdate });
          }
        } else if (current.dtend) {
          events.push({ dtstart: current.dtstart, dtend: current.dtend, rrule: current.rrule, exdate: current.exdate });
        }
      }
      current = null;
    } else if (current) {
      if (line.startsWith("DTSTART")) current.dtstart = extractDateValue(line);
      if (line.startsWith("DTEND")) current.dtend = extractDateValue(line);
      if (line.startsWith("DURATION")) current.duration = extractDateValue(line);
      if (line.startsWith("RRULE")) current.rrule = extractDateValue(line);
      if (line.startsWith("TRANSP")) current.transp = extractDateValue(line);
      if (line.startsWith("EXDATE")) {
        const v = extractDateValue(line);
        if (v) {
          if (!current.exdate) current.exdate = [];
          for (const part of v.split(",")) current.exdate.push(part);
        }
      }
    }
  }

  const normalized: { start: string; end: string }[] = [];
  const windowStart = opts?.windowStart ? new Date(opts.windowStart) : undefined;
  const windowEnd = opts?.windowEnd ? new Date(opts.windowEnd) : undefined;

  for (const e of events) {
    if (!e.dtstart || !e.dtend) continue;
    const baseStartIso = normalizeToIso(e.dtstart);
    const baseEndIso = normalizeToIso(e.dtend);
    if (!baseStartIso || !baseEndIso) continue;
    const durationMs = new Date(baseEndIso).getTime() - new Date(baseStartIso).getTime();
    if (!e.rrule) {
      if (new Date(baseEndIso) > new Date(baseStartIso)) normalized.push({ start: baseStartIso, end: baseEndIso });
      continue;
    }

    // Minimal RRULE support (WEEKLY with optional BYDAY, UNTIL, INTERVAL)
    const r = parseRRule(e.rrule);
    if (r.freq !== "WEEKLY") {
      // Fallback: treat as single event if unsupported frequency
      normalized.push({ start: baseStartIso, end: baseEndIso });
      continue;
    }

    const exdates = new Set<string>((e.exdate || []).map((d) => normalizeToIso(d)).filter(Boolean) as string[]);
    const interval = Math.max(1, r.interval || 1);
    const until = r.until ? new Date(normalizeToIso(r.until) || "") : undefined;

    // Determine which weekdays are active
    const activeWeekdays = r.byday && r.byday.length > 0 ? new Set(r.byday) : undefined;
    const baseStart = new Date(baseStartIso);

    // Compute iteration start within the window
    let iter = new Date(baseStart);
    if (windowStart) {
      // Fast-forward in steps of 'interval' weeks to on/after windowStart
      const msPerWeek = 7 * 24 * 60 * 60 * 1000;
      const diffWeeks = Math.floor((windowStart.getTime() - iter.getTime()) / (msPerWeek * interval));
      if (diffWeeks > 0) iter = new Date(iter.getTime() + diffWeeks * msPerWeek * interval);
    }

    // Iterate occurrences within window
    const endGuard = windowEnd ? windowEnd.getTime() + durationMs : Number.POSITIVE_INFINITY;
    const weekdayMap = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

    const pushIfActive = (start: Date) => {
      if (until && start.getTime() > until.getTime()) return;
      const key = start.toISOString();
      if (exdates.has(key)) return;
      const end = new Date(start.getTime() + durationMs);
      if (windowStart && end <= windowStart) return;
      if (windowEnd && start >= windowEnd) return;
      normalized.push({ start: start.toISOString(), end: end.toISOString() });
    };

    while (iter.getTime() < endGuard) {
      if (!activeWeekdays) {
        pushIfActive(iter);
      } else {
        // Generate occurrences in the iter-week for specified BYDAYs, preserving time-of-day from baseStart
        const startOfWeek = startOfWeekFrom(iter);
        for (let i = 0; i < 7; i++) {
          const d = new Date(startOfWeek.getTime() + i * 86400000);
          const code = weekdayMap[d.getDay()];
          if (activeWeekdays.has(code)) {
            const oc = new Date(d);
            oc.setHours(baseStart.getHours(), baseStart.getMinutes(), baseStart.getSeconds(), baseStart.getMilliseconds());
            pushIfActive(oc);
          }
        }
      }
      // jump by interval weeks
      iter = new Date(iter.getTime() + interval * 7 * 24 * 60 * 60 * 1000);
    }
  }
  return normalized;
}

function extractDateValue(line: string): string {
  const parts = line.split(":");
  return parts[1] || "";
}

function icsToISO(v: string): string {
  // Supports: 20250101T130000Z or 20250101T130000 (no Z = local time of calendar)
  // In serverless(UTC), non-ZをローカルJST等として扱う必要があるため、オフセットを明示してUTCに正規化する
  const tzOffsetMinutes = Number(process.env.ICAL_TZ_OFFSET_MINUTES ?? "540"); // default: JST(+09:00)

  if (/Z$/.test(v)) {
    const iso = v.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, "$1-$2-$3T$4:$5:$6Z");
    return iso;
  }
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const hh = Number(m[4]);
    const mm = Number(m[5]);
    const ss = Number(m[6]);
    // Local time (calendar) → UTC instant
    const utcMs = Date.UTC(y, mo, d, hh, mm, ss) - tzOffsetMinutes * 60 * 1000;
    return new Date(utcMs).toISOString();
  }
  // All-day events (YYYYMMDD) → same approach at 00:00 local
  const d = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (d) {
    const y = Number(d[1]);
    const mo = Number(d[2]) - 1;
    const day = Number(d[3]);
    const utcMs = Date.UTC(y, mo, day, 0, 0, 0) - tzOffsetMinutes * 60 * 1000;
    return new Date(utcMs).toISOString();
  }
  return "";
}

function parseIcsDurationToMs(v: string): number {
  // RFC5545 duration (e.g., P1D, PT1H, PT30M, PT1H30M)
  // Simple parser covering common patterns we expect for meetings
  const m = v.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return 0;
  const days = Number(m[1] || 0);
  const hours = Number(m[2] || 0);
  const minutes = Number(m[3] || 0);
  const seconds = Number(m[4] || 0);
  return (((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000;
}

function normalizeToIso(v: string): string {
  if (!v) return "";
  // Already ISO-like
  if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return v;
  // ICS basic timestamp or date
  if (/^\d{8}T\d{6}Z?$/.test(v) || /^\d{8}$/.test(v)) return icsToISO(v);
  return "";
}

function mergeIntervals(list: { start: Date; end: Date }[]): { start: Date; end: Date }[] {
  const arr = list.slice().sort((a, b) => a.start.getTime() - b.start.getTime());
  const out: { start: Date; end: Date }[] = [];
  for (const iv of arr) {
    const last = out[out.length - 1];
    if (!last || iv.start.getTime() > last.end.getTime()) out.push({ ...iv });
    else if (iv.end.getTime() > last.end.getTime()) last.end = iv.end;
  }
  return out;
}

type RRule = {
  freq?: string;
  interval?: number;
  until?: string;
  byday?: string[];
};

function parseRRule(v: string): RRule {
  const out: RRule = {};
  const parts = v.split(";").map((s) => s.trim());
  for (const p of parts) {
    const [k, val] = p.split("=");
    if (!k || !val) continue;
    const key = k.toUpperCase();
    if (key === "FREQ") out.freq = val.toUpperCase();
    else if (key === "INTERVAL") out.interval = Number(val) || 1;
    else if (key === "UNTIL") out.until = val;
    else if (key === "BYDAY") out.byday = val.split(",").map((d) => d.toUpperCase());
  }
  return out;
}

function startOfWeekFrom(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // Monday as start
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}



