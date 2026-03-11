import { NextResponse } from "next/server";
import { getRedis } from "../../../lib/redis";

export const dynamic = "force-dynamic";

const KV_KEY = "work_locations";

type LocationMap = Record<string, string>;

// GET: 今日以降の勤務場所を取得（公開用）+ 古いエントリを自動削除
export async function GET() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10);

    const raw = await getRedis().get(KV_KEY);
    const data: LocationMap = raw ? JSON.parse(raw) : {};
    const result: LocationMap = {};
    let needsClean = false;

    for (const [date, location] of Object.entries(data)) {
      if (date >= todayStr) {
        result[date] = location;
      } else {
        needsClean = true;
      }
    }

    // 古いエントリがあれば削除
    if (needsClean) {
      await getRedis().set(KV_KEY, JSON.stringify(result));
    }

    return NextResponse.json({ ok: true, locations: result });
  } catch (error) {
    console.error("Failed to get locations:", error);
    return NextResponse.json(
      { ok: false, error: "データの取得に失敗しました" },
      { status: 500 }
    );
  }
}
