import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "../../../../lib/redis";

export const dynamic = "force-dynamic";

const KV_KEY = "work_locations";

type LocationMap = Record<string, string>;

async function getLocations(): Promise<LocationMap> {
  const raw = await getRedis().get(KV_KEY);
  return raw ? JSON.parse(raw) : {};
}

async function setLocations(data: LocationMap): Promise<void> {
  await getRedis().set(KV_KEY, JSON.stringify(data));
}

function formatDateJST(date: Date): string {
  return date.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

// 昨日以前のエントリを削除 + 今日から2ヶ月後まで「未定（お問い合わせください）」を自動補填
async function cleanAndFillEntries(): Promise<LocationMap> {
  const todayStr = formatDateJST(new Date());

  const data = await getLocations();
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
    await setLocations(cleaned);
  }

  return cleaned;
}

// GET: 全勤務場所を取得（admin用）
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

// POST: 勤務場所を設定
export async function POST(request: NextRequest) {
  try {
    const { date, location } = await request.json();

    if (!date || !location) {
      return NextResponse.json(
        { ok: false, error: "日付と勤務場所を指定してください" },
        { status: 400 }
      );
    }

    const data = await getLocations();
    data[date] = location;
    await setLocations(data);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to set location:", error);
    return NextResponse.json(
      { ok: false, error: "保存に失敗しました" },
      { status: 500 }
    );
  }
}

// DELETE: 勤務場所を削除
export async function DELETE(request: NextRequest) {
  try {
    const { date } = await request.json();

    if (!date) {
      return NextResponse.json(
        { ok: false, error: "日付を指定してください" },
        { status: 400 }
      );
    }

    const data = await getLocations();
    delete data[date];
    await setLocations(data);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete location:", error);
    return NextResponse.json(
      { ok: false, error: "削除に失敗しました" },
      { status: 500 }
    );
  }
}
