import { NextResponse } from "next/server";
import { auth, isAllowedAdmin } from "@/lib/auth";

type BusyInterval = { 
  start: string; 
  end: string; 
  source?: string;
  sourceUrl?: string;
};

type SourceInfo = {
  url: string;
  name: string;
  ok: boolean;
  status: number;
  eventCount: number;
};

export async function GET(req: Request) {
  try {
    // 認証チェック
    const session = await auth();
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    if (!isAllowedAdmin(session.user.email)) {
      return NextResponse.json({ error: "not_allowed" }, { status: 403 });
    }


    const url = new URL(req.url);
    const weekStartISO = url.searchParams.get("weekStartISO");

    // iCal URLを取得
    let urls: { url: string; name: string }[] = [];
    const csv = process.env.ICAL_URLS || "";
    
    if (csv.trim()) {
      urls = csv.split(/\s*,\s*/).filter(Boolean).map((u, i) => ({
        url: u,
        name: process.env[`ICAL_NAME_${i + 1}`] || `Calendar ${i + 1}`,
      }));
    } else {
      for (let i = 1; i <= 19; i++) {
        const v = process.env[`ICAL_URL_${i}`];
        if (v && v.trim()) {
          urls.push({
            url: v.trim(),
            name: process.env[`ICAL_NAME_${i}`] || `Calendar ${i}`,
          });
        }
      }
    }

    urls = urls.map((u) => ({
      ...u,
      url: u.url.replace(/^webcal:\/\//i, "https://"),
    }));

    // 週の開始と終了を計算
    const defaultMonday = (() => {
      const now = new Date();
      const day = now.getDay();
      const diff = (day === 0 ? -6 : 1) - day;
      const d = new Date(now);
      d.setDate(d.getDate() + diff);
      d.setHours(0, 0, 0, 0);
      return d;
    })();

    const weekStart = new Date(weekStartISO || defaultMonday.toISOString());
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    // 各カレンダーからデータを取得
    const results = await Promise.all(
      urls.map(async ({ url, name }) => {
        try {
          const res = await fetch(url, {
            cache: "no-store",
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
              Accept: "text/calendar, text/plain, */*",
            },
          });
          
          if (!res.ok) {
            return { url, name, ok: false, status: res.status, text: "", events: [] };
          }
          
          const text = await res.text();
          const events = parseIcsEvents(text, { windowStart: weekStart, windowEnd: weekEnd });
          
          return { url, name, ok: true, status: res.status, text, events };
        } catch {
          return { url, name, ok: false, status: 0, text: "", events: [] };
        }
      })
    );

    // ソース情報を整理
    const sources: SourceInfo[] = results.map((r) => ({
      url: maskUrl(r.url),
      name: r.name,
      ok: r.ok,
      status: r.status,
      eventCount: r.events.length,
    }));

    // 全イベントを統合（ソース情報付き）
    const allEvents: BusyInterval[] = results.flatMap((r) =>
      r.events.map((e) => ({
        ...e,
        source: r.name,
        sourceUrl: maskUrl(r.url),
      }))
    );

    // 時間順でソート
    allEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    return NextResponse.json({
      sources,
      events: allEvents,
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
    });
  } catch (error) {
    console.error("Admin iCal sources error:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// URLをマスク（セキュリティのため）
function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}/***`;
  } catch {
    return "***";
  }
}

// iCSイベントをパース
function parseIcsEvents(
  ics: string,
  opts?: { windowStart?: Date; windowEnd?: Date }
): { start: string; end: string; summary?: string }[] {
  if (!ics) return [];

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
    summary?: string;
    transp?: string;
  };

  const events: { start: string; end: string; summary?: string }[] = [];
  let current: EventAcc | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    
    if (line === "BEGIN:VEVENT") {
      current = {};
    } else if (line === "END:VEVENT") {
      if (current?.dtstart) {
        if (current.transp?.toUpperCase() === "TRANSPARENT") {
          current = null;
          continue;
        }

        const startIso = icsToISO(current.dtstart);
        const endIso = current.dtend ? icsToISO(current.dtend) : null;

        if (startIso && endIso) {
          const startDate = new Date(startIso);
          const endDate = new Date(endIso);

          // ウィンドウ内のイベントのみ
          if (
            (!opts?.windowEnd || startDate < opts.windowEnd) &&
            (!opts?.windowStart || endDate > opts.windowStart)
          ) {
            events.push({
              start: startIso,
              end: endIso,
              summary: current.summary || "(無題)",
            });
          }
        }
      }
      current = null;
    } else if (current) {
      if (line.startsWith("DTSTART")) {
        current.dtstart = line.split(":").slice(1).join(":");
      } else if (line.startsWith("DTEND")) {
        current.dtend = line.split(":").slice(1).join(":");
      } else if (line.startsWith("SUMMARY:")) {
        current.summary = line.substring(8);
      } else if (line.startsWith("TRANSP:")) {
        current.transp = line.substring(7);
      }
    }
  }

  return events;
}

function icsToISO(val: string): string | null {
  if (!val) return null;
  
  // 基本形式: 20240101T120000Z または 20240101T120000
  const match = val.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?Z?$/);
  
  if (match) {
    const [, y, m, d, hh, mm, ss] = match;
    const hour = hh || "00";
    const min = mm || "00";
    const sec = ss || "00";
    return `${y}-${m}-${d}T${hour}:${min}:${sec}Z`;
  }
  
  // 日付のみ: 20240101
  const dateMatch = val.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateMatch) {
    const [, y, m, d] = dateMatch;
    return `${y}-${m}-${d}T00:00:00Z`;
  }
  
  return null;
}
