import { sendMetric } from "@/lib/dogstatsd";
import { GoogleCalendar } from "./google";
import { reconcile, removeMirrorsIn, type SyncCalendar } from "./reconcile";
import {
  decrypt, loadAccounts, loadMirrors, saveAccounts, saveLastRun, saveMirrors, withLock, type LastRun,
} from "./store";

// CronJob は 5 分ごと。次の回と重ならないよう、新しい書き込みは 4 分で打ち切って次回に回す。
// 管理画面の「今すぐ同期」は Cloudflare の 100 秒制限に収まるよう 80 秒で区切る
export const CRON_BUDGET_MS = 4 * 60_000;
export const INTERACTIVE_BUDGET_MS = 80_000;
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function connectAll(accounts: { calendarId: string; refreshToken: string }[]) {
  const calendars: SyncCalendar[] = [];
  const reconnect: string[] = [];
  const errors: LastRun["errors"] = [];
  for (const account of accounts) {
    try {
      calendars.push(await GoogleCalendar.connect(account.calendarId, decrypt(account.refreshToken)));
    } catch (err) {
      // 更新トークンの失効（パスワード変更・アクセス取り消し・組織のポリシー）など
      reconnect.push(account.calendarId);
      errors.push({ calendarId: account.calendarId, error: message(err) });
    }
  }
  return { calendars, reconnect, errors };
}

/** Datadog へ: 1 回の同期の結果（ダッシュボードとアラート用） */
function reportMetrics(run: LastRun, accounts: number): void {
  const status = run.errors.length ? "error" : run.pending ? "partial" : "ok";
  sendMetric("calendar_sync.run", 1, "count", [`status:${status}`]);
  sendMetric("calendar_sync.run.duration_ms", run.durationMs, "histogram");
  sendMetric("calendar_sync.writes", run.writes, "count");
  sendMetric("calendar_sync.deletes", run.deletes, "count");
  sendMetric("calendar_sync.errors", run.errors.length, "count");
  sendMetric("calendar_sync.pending", run.pending, "gauge");
  sendMetric("calendar_sync.source_events", run.sourceEvents, "gauge");
  sendMetric("calendar_sync.mirrors", run.mirrors, "gauge");
  sendMetric("calendar_sync.accounts", accounts, "gauge");
  sendMetric("calendar_sync.accounts.reconnect_needed", run.reconnect.length, "gauge");
}

export async function runSync(budgetMs = CRON_BUDGET_MS): Promise<LastRun> {
  return withLock(async () => {
    const started = Date.now();
    const { master, accounts } = await loadAccounts();
    if (accounts.length < 2) {
      const idle: LastRun = {
        sourceEvents: 0, mirrors: 0, writes: 0, deletes: 0, pending: 0, reconnect: [],
        errors: [{ calendarId: "-", error: "2 つ以上のアカウントを接続すると同期を始めます" }],
        at: new Date(started).toISOString(), durationMs: 0,
      };
      await saveLastRun(idle);
      return idle;
    }
    const { calendars, reconnect, errors } = await connectAll(accounts);
    const state = { master, mirrors: await loadMirrors() };
    const result = await reconcile(calendars, state, {
      deadline: started + budgetMs,
      unavailable: reconnect,
      privateSources: new Set(accounts.filter((a) => a.private).map((a) => a.calendarId)),
      days: Number(process.env.SYNC_DAYS || 90),
    });
    await saveMirrors(state.mirrors ?? {});
    const run: LastRun = {
      ...result, errors: [...errors, ...result.errors],
      at: new Date(started).toISOString(), durationMs: Date.now() - started, reconnect,
    };
    await saveLastRun(run);
    reportMetrics(run, accounts.length);
    console.log(`[calendar-sync] ${JSON.stringify({ ...run, errors: run.errors.length })}`);
    return run;
  });
}

/** 接続を解除する。そのアカウントのカレンダーにある同期予定も消す */
export async function disconnect(calendarId: string): Promise<{ deleted: number; failed: number }> {
  return withLock(async () => {
    const data = await loadAccounts();
    const account = data.accounts.find((a) => a.calendarId === calendarId);
    if (!account) throw new Error(`接続されていません: ${calendarId}`);
    const mirrors = await loadMirrors();
    let outcome = { deleted: 0, failed: 0, remaining: mirrors };
    try {
      outcome = await removeMirrorsIn(await GoogleCalendar.connect(calendarId, decrypt(account.refreshToken)), mirrors);
    } catch {
      // トークンが失効していて消せない。記録だけ外す（残った「予定あり」は手動で削除してもらう）
      const remaining = Object.fromEntries(Object.entries(mirrors).filter(([k]) => JSON.parse(k)[2] !== calendarId));
      outcome = { deleted: 0, failed: Object.keys(mirrors).length - Object.keys(remaining).length, remaining };
    }
    await saveMirrors(outcome.remaining);
    await saveAccounts({
      master: data.master === calendarId ? null : data.master,
      accounts: data.accounts.filter((a) => a.calendarId !== calendarId),
    });
    return { deleted: outcome.deleted, failed: outcome.failed };
  });
}
