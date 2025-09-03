import { NextResponse } from "next/server";

type BusyRequest = {
  weekStartISO: string; // Monday 00:00 ISO
};

type BusyInterval = { start: string; end: string };

export async function POST(req: Request) {
  try {
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
      for (let i = 1; i <= 10; i++) {
        const v = process.env[`ICAL_URL_${i}`];
        if (v && v.trim()) envUrls.push(v.trim());
      }
      urls = envUrls;
    }
    urls = urls.map((u) => u.replace(/^webcal:\/\//i, "https://"));
    const texts = await Promise.all(urls.map((u) => safeFetchText(u)));
    const intervals = texts.flatMap((t) => parseIcsBusyIntervals(t));

    // Clip to the requested week and merge overlaps
    const clipped = intervals
      .map((iv) => ({
        start: new Date(Math.max(new Date(iv.start).getTime(), weekStart.getTime())),
        end: new Date(Math.min(new Date(iv.end).getTime(), weekEnd.getTime())),
      }))
      .filter((iv) => iv.end > iv.start);

    const merged = mergeIntervals(clipped);
    const payload: BusyInterval[] = merged.map((iv) => ({ start: iv.start.toISOString(), end: iv.end.toISOString() }));
    return NextResponse.json({ busy: payload });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ busy: [] }, { status: 200 });
  }
}

async function safeFetchText(url: string): Promise<string> {
  try {
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
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
  // Supports: 20250101T130000Z or 20250101T130000
  if (/Z$/.test(v)) {
    const iso = v.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, "$1-$2-$3T$4:$5:$6Z");
    return iso;
  }
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
    return d.toISOString();
  }
  // All-day events (YYYYMMDD)
  const d = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (d) {
    const start = new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]));
    return start.toISOString();
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


