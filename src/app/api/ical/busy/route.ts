export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
import { NextResponse } from "next/server";

type BusyRequest = {
  weekStartISO: string; // Monday 00:00 ISO
};

type BusyInterval = { start: string; end: string };

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const debug = url.searchParams.get("debug") === "1";
    const body = (await req.json()) as BusyRequest;
    const weekStart = new Date(body.weekStartISO);
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
    const intervals = texts.flatMap((t) => parseIcsBusyIntervals(t));

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

function parseIcsBusyIntervals(ics: string): { start: string; end: string }[] {
  if (!ics) return [];
  const lines = ics.split(/\r?\n/);
  const events: { dtstart?: string; dtend?: string }[] = [];
  let current: { dtstart?: string; dtend?: string } | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "BEGIN:VEVENT") current = {};
    else if (line === "END:VEVENT") {
      if (current?.dtstart && current?.dtend) events.push({ dtstart: current.dtstart, dtend: current.dtend });
      current = null;
    } else if (current) {
      if (line.startsWith("DTSTART")) current.dtstart = extractDateValue(line);
      if (line.startsWith("DTEND")) current.dtend = extractDateValue(line);
    }
  }
  return events
    .map((e) => ({ start: icsToISO(e.dtstart!), end: icsToISO(e.dtend!) }))
    .filter((e) => e.start && e.end && new Date(e.end) > new Date(e.start));
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


