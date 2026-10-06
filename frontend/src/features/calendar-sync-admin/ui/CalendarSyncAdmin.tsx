import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, ButtonLink } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { calendarSyncApi } from "@/shared/api/clients";
import { toApiError } from "@/shared/api/errors";
import { AdminNotice, AdminPanel } from "@/shared/ui/admin";

type Notice = { ok: boolean; message: string };

/** カレンダー同期の管理（接続しているアカウント・マスター・前回の同期）。文言は旧 admin/calendar-sync と同じ */
export function CalendarSyncAdmin() {
  const status = useQuery({
    queryKey: ["calendar-sync-status"],
    queryFn: () => calendarSyncApi.getStatus({}),
    retry: false,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  // OAuth から戻ってきたときの結果を表示して、URL からは消す
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const error = params.get("error");
    if (connected) setNotice({ ok: true, message: `接続しました: ${connected}` });
    if (error) setNotice({ ok: false, message: error });
    if (connected || error) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const call = useCallback(
    async (label: string, run: () => Promise<string>) => {
      setBusy(label);
      setNotice(null);
      try {
        setNotice({ ok: true, message: await run() });
      } catch (err) {
        setNotice({ ok: false, message: toApiError(err).message || "失敗しました" });
      } finally {
        await status.refetch();
        setBusy(null);
      }
    },
    [status],
  );

  const runNow = () =>
    call("run", async () => {
      const { run: r } = await calendarSyncApi.runSync({});
      if (!r) return "同期しました";
      return (
        `同期しました（書き込み ${r.writes} 件・削除 ${r.deletes} 件${r.errors.length ? `・エラー ${r.errors.length} 件` : ""}）` +
        (r.pending ? `。残り ${r.pending} 件は 5 分ごとの自動同期で続けます` : "")
      );
    });
  const setMaster = (master: string | null) =>
    call("master", async () => {
      await calendarSyncApi.updateSettings({ setMaster: true, master: master ?? "" });
      return "マスターを変更しました。次回の同期で既存の予定も書き換わります";
    });
  const setPrivate = (calendarId: string, value: boolean) =>
    call("private", async () => {
      await calendarSyncApi.updateSettings({ privateCalendarId: calendarId, privateValue: value });
      return "変更しました";
    });
  const remove = (calendarId: string) => {
    if (!confirm(`${calendarId} の接続を解除し、このカレンダーにある同期予定を削除します。よろしいですか？`)) return;
    void call(`remove:${calendarId}`, async () => {
      const r = await calendarSyncApi.disconnect({ calendarId });
      return `解除しました（同期予定 ${r.deleted} 件を削除${r.failed ? `、${r.failed} 件は削除できませんでした` : ""}）`;
    });
  };

  const data = status.data;
  const accounts = data?.accounts ?? [];
  const lastRun = data?.lastRun;
  const reconnect = new Set(lastRun?.reconnect ?? []);

  return (
    <div className="flex flex-col gap-6">
      {notice && <AdminNotice ok={notice.ok}>{notice.message}</AdminNotice>}
      {status.isError && <AdminNotice ok={false}>{toApiError(status.error).message || "取得に失敗しました"}</AdminNotice>}

      <AdminPanel
        title={
          <>
            接続しているアカウント <span className="ms-1 text-body-2-regular text-text-tertiary">{accounts.length} 件</span>
          </>
        }
        actions={
          <>
            <ButtonLink href="/api/calendar-sync/connect" variant="primary">
              アカウントを接続
            </ButtonLink>
            <Button variant="secondary" onClick={runNow} disabled={!!busy || accounts.length < 2}>
              {busy === "run" ? "同期中..." : "今すぐ同期"}
            </Button>
          </>
        }
      >
        {accounts.length === 0 ? (
          <p className="text-body-2-regular text-text-tertiary">まだ接続していません。「アカウントを接続」から 1 つずつ追加してください。</p>
        ) : (
          <ul className="divide-y divide-separator-border">
            {accounts.map((a) => {
              const isMaster = data?.master === a.calendarId;
              return (
                <li key={a.calendarId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-body-medium break-all text-text-primary">
                      {a.calendarId}
                      {isMaster && <span className="rounded-md bg-accent-500/15 px-2 py-0.5 text-caption-1-semibold text-accent-300">マスター</span>}
                      {reconnect.has(a.calendarId) && (
                        <a
                          href={`/api/calendar-sync/connect?hint=${encodeURIComponent(a.calendarId)}`}
                          className="rounded-md border border-border-error-default px-2 py-0.5 text-caption-1-semibold text-text-error-primary hover:underline"
                        >
                          要再接続
                        </a>
                      )}
                    </p>
                    <p className="text-caption-1-regular text-text-tertiary">接続: {new Date(a.connectedAt).toLocaleString("ja-JP")}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span title="マスターに中身を出すとき、予定を非公開にします">
                      <Checkbox size="sm" isSelected={a.private} isDisabled={!!busy} onChange={(v) => setPrivate(a.calendarId, v)}>
                        マスターで非公開
                      </Checkbox>
                    </span>
                    <Button variant="secondary" size="small" onClick={() => setMaster(isMaster ? null : a.calendarId)} disabled={!!busy}>
                      {isMaster ? "マスター解除" : "マスターにする"}
                    </Button>
                    <Button variant="ghost" size="small" className="text-text-error-primary" onClick={() => remove(a.calendarId)} disabled={!!busy}>
                      {busy === `remove:${a.calendarId}` ? "解除中..." : "解除"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-4 text-caption-1-regular leading-relaxed text-text-tertiary">
          マスターには他のアカウントの予定が中身付き（タイトル・場所・説明・Meet の URL）で入り、それ以外のアカウントには「予定あり」だけが入ります。
          参加者はコピーしません。過去 1 日から 90 日先までを 5 分ごとに同期します。
        </p>
      </AdminPanel>

      {lastRun && (
        <AdminPanel title="前回の同期">
          <p className="-mt-2 mb-4 text-caption-1-regular text-text-tertiary">
            {new Date(lastRun.at).toLocaleString("ja-JP")}（{(Number(lastRun.durationMs) / 1000).toFixed(1)} 秒）
          </p>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {(
              [
                ["元の予定", lastRun.sourceEvents],
                ["同期中の予定", lastRun.mirrors],
                ["書き込み", lastRun.writes],
                ["削除", lastRun.deletes],
                ["次回に回した分", lastRun.pending],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-xl bg-background-secondary-default p-3">
                <dt className="text-caption-1-medium text-text-tertiary">{label}</dt>
                <dd className="text-title-3-semibold tabular-nums text-text-primary">{value}</dd>
              </div>
            ))}
          </dl>
          {lastRun.errors.length > 0 && (
            <ul className="mt-4 flex flex-col gap-1 text-caption-1-regular text-text-error-primary">
              {lastRun.errors.slice(0, 20).map((e, i) => (
                <li key={i} className="break-all">
                  {e.calendarId}: {e.error}
                </li>
              ))}
              {lastRun.errors.length > 20 && <li className="text-text-tertiary">ほか {lastRun.errors.length - 20} 件</li>}
            </ul>
          )}
        </AdminPanel>
      )}
    </div>
  );
}
