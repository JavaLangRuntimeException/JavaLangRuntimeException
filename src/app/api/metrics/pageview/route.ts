import { NextRequest } from "next/server";
import { sendMetric } from "@/lib/dogstatsd";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// タグの値を既知のページに限る（任意の URL でタグが増え続けると Datadog の課金が膨らむ）
const PAGES = new Set(["/", "/link", "/blogs", "/portfolio", "/contact", "/reserve", "/location", "/questionnaire", "/privacy", "/calendar-sync"]);
const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|curl|wget|python-requests/i;

function pageOf(path: unknown): string {
  if (typeof path !== "string") return "other";
  const first = "/" + (path.split("?")[0].split("/")[1] ?? "");
  return PAGES.has(first) ? first : "other";
}

// POST: ブラウザがページを表示したら呼ばれる（PageviewBeacon）。Datadog の web.pageviews を 1 増やす
export async function POST(req: NextRequest) {
  const ua = req.headers.get("user-agent") || "";
  if (!BOT.test(ua)) {
    let path: unknown;
    try {
      path = (JSON.parse(await req.text()) as { path?: unknown }).path;
    } catch {
      path = undefined;
    }
    const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").split(":")[0].replace(/^www\./, "");
    const page = pageOf(path);
    if (!String(path).startsWith("/admin")) {
      sendMetric("web.pageviews", 1, "count", [`page:${page}`, `site:${host === "taramanji.com" ? host : "other"}`]);
    }
  }
  return new Response(null, { status: 204 });
}
