import { NextResponse } from "next/server";
import { getRedis } from "../../../lib/redis";

export const dynamic = "force-dynamic";

const KV_KEY = "work_locations";

type LocationMap = Record<string, string>;

function formatDateJST(date: Date): string {
  return date.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

// 昨日以前のエントリを削除 + 今日から2ヶ月後まで「未定（お問い合わせください）」を自動補填
async function cleanAndFillEntries(): Promise<LocationMap> {
  const todayStr = formatDateJST(new Date());

  const raw = await getRedis().get(KV_KEY);
  const data: LocationMap = raw ? JSON.parse(raw) : {};
  const cleaned: LocationMap = {};

  // 過去のエントリを除外
  for (const [date, location] of Object.entries(data)) {
    if (date >= todayStr) {
      cleaned[date] = location;
    }
  }

  // 今日から2ヶ月後まで、未登録の日に「未定（お問い合わせください）」を自動セット
  const today = new Date();
  const twoMonthsLater = new Date(today);
  twoMonthsLater.setMonth(twoMonthsLater.getMonth() + 2);

  const cursor = new Date(today);
  let added = false;
  while (formatDateJST(cursor) <= formatDateJST(twoMonthsLater)) {
    const dateStr = formatDateJST(cursor);
    if (!(dateStr in cleaned)) {
      cleaned[dateStr] = "未定（お問い合わせください）";
      added = true;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  if (added || Object.keys(cleaned).length !== Object.keys(data).length) {
    await getRedis().set(KV_KEY, JSON.stringify(cleaned));
  }

  return cleaned;
}

// GET: 今日以降の勤務場所を取得（公開用）+ 未定の自動補填
export async function GET() {
  try {
    const data = await cleanAndFillEntries();
    return NextResponse.json({ ok: true, locations: data });
  } catch (error) {
    console.error("Failed to get locations:", error);
    return NextResponse.json(
      { ok: false, error: "データの取得に失敗しました" },
      { status: 500 }
    );
  }
}
