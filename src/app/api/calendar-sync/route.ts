import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { rejectUnlessAdmin } from "@/lib/admin-guard";
import { sendMetric } from "@/lib/dogstatsd";
import { LockedError, loadAccounts, loadLastRun, saveAccounts } from "@/feature/calendar-sync/store";
import { CRON_BUDGET_MS, disconnect, INTERACTIVE_BUDGET_MS, runSync } from "@/feature/calendar-sync/sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// 初回は書き込みが多い（同期本体は 4 分で打ち切る）
export const maxDuration = 300;

const fail = (error: unknown, status = 500) =>
  NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status });

/** CronJob からの Bearer トークン */
function isCron(req: NextRequest): boolean {
  const expected = process.env.CALENDAR_SYNC_CRON_TOKEN;
  const header = req.headers.get("authorization") || "";
  if (!expected || !header.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7));
  const want = Buffer.from(expected);
  return given.length === want.length && timingSafeEqual(given, want);
}

// GET: 接続済みアカウント・マスター・前回の実行結果（トークンは返さない）
export async function GET() {
  const denied = await rejectUnlessAdmin();
  if (denied) return denied;
  try {
    const { master, accounts } = await loadAccounts();
    return NextResponse.json({
      ok: true,
      master,
      accounts: accounts.map(({ calendarId, private: isPrivate, connectedAt }) => ({ calendarId, private: !!isPrivate, connectedAt })),
      lastRun: await loadLastRun(),
    });
  } catch (error) {
    return fail(error);
  }
}

// POST: 同期を実行（管理画面の「今すぐ同期」と CronJob）
export async function POST(req: NextRequest) {
  const cron = isCron(req);
  if (!cron) {
    const denied = await rejectUnlessAdmin();
    if (denied) return denied;
  }
  try {
    const result = await runSync(cron ? CRON_BUDGET_MS : INTERACTIVE_BUDGET_MS);
    return NextResponse.json({ ok: result.errors.length === 0, result });
  } catch (error) {
    // 前の回がまだ動いている。CronJob は失敗扱いにしない（次の回で続きをやる）
    if (error instanceof LockedError) {
      sendMetric("calendar_sync.run", 1, "count", ["status:skipped"]);
      return cron ? NextResponse.json({ ok: true, skipped: true }) : fail(error, 409);
    }
    sendMetric("calendar_sync.run", 1, "count", ["status:failed"]);
    console.error("[calendar-sync] run failed:", error);
    return fail(error);
  }
}

// PATCH: { master: "id" | null } または { private: { calendarId, value } }
export async function PATCH(req: NextRequest) {
  const denied = await rejectUnlessAdmin();
  if (denied) return denied;
  try {
    const body = await req.json();
    const data = await loadAccounts();
    const known = (id: string) => data.accounts.some((a) => a.calendarId === id);
    if ("master" in body) {
      if (body.master !== null && !known(body.master)) return fail(`接続されていません: ${body.master}`, 400);
      data.master = body.master;
    }
    if (body.private) {
      const account = data.accounts.find((a) => a.calendarId === body.private.calendarId);
      if (!account) return fail(`接続されていません: ${body.private.calendarId}`, 400);
      account.private = !!body.private.value;
    }
    await saveAccounts(data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}

// DELETE: { calendarId } の接続を解除し、そのカレンダーの同期予定を消す
export async function DELETE(req: NextRequest) {
  const denied = await rejectUnlessAdmin();
  if (denied) return denied;
  try {
    const { calendarId } = await req.json();
    return NextResponse.json({ ok: true, ...(await disconnect(String(calendarId))) });
  } catch (error) {
    return fail(error, error instanceof LockedError ? 409 : 500);
  }
}
