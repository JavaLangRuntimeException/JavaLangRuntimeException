import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, ButtonLink } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { calendarSyncApi } from "@/shared/api/clients";
import { toApiError } from "@/shared/api/errors";
import { intlLocale, useLocale, useT, type L10n } from "@/shared/lib/i18n";
import { AdminNotice, AdminPanel } from "@/shared/ui/admin";
import { colorOf } from "../model/colors";
import { ColorSelect } from "./ColorSelect";

// サーバーから来た文言は言語によらず同じものを両方に入れる
type Notice = { ok: boolean; message: L10n };
const same = (m: string): L10n => ({ ja: m, en: m });

/** カレンダー同期の管理（接続しているアカウント・マスター・前回の同期）。文言は旧 admin/calendar-sync と同じ */
export function CalendarSyncAdmin() {
  const status = useQuery({
    queryKey: ["calendar-sync-status"],
    queryFn: () => calendarSyncApi.getStatus({}),
    retry: false,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const t = useT();
  const locale = useLocale();

  // OAuth から戻ってきたときの結果を表示して、URL からは消す
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const error = params.get("error");
    if (connected) setNotice({ ok: true, message: { ja: `接続しました: ${connected}`, en: `Connected: ${connected}` } });
    if (error) setNotice({ ok: false, message: same(error) });
    if (connected || error) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const call = useCallback(
    async (label: string, run: () => Promise<L10n>) => {
      setBusy(label);
      setNotice(null);
      try {
        setNotice({ ok: true, message: await run() });
      } catch (err) {
        const m = toApiError(err).message;
        setNotice({ ok: false, message: m ? same(m) : { ja: "失敗しました", en: "Failed." } });
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
      if (!r) return { ja: "同期しました", en: "Synced." };
      return {
        ja:
          `同期しました（書き込み ${r.writes} 件・削除 ${r.deletes} 件${r.errors.length ? `・エラー ${r.errors.length} 件` : ""}）` +
          (r.pending ? `。残り ${r.pending} 件は 5 分ごとの自動同期で続けます` : ""),
        en:
          `Synced (${r.writes} written, ${r.deletes} deleted${r.errors.length ? `, ${r.errors.length} errors` : ""})` +
          (r.pending ? `. The remaining ${r.pending} will continue in the automatic sync every 5 minutes.` : "."),
      };
    });
  const setMaster = (master: string | null) =>
    call("master", async () => {
      await calendarSyncApi.updateSettings({ setMaster: true, master: master ?? "" });
      return {
        ja: "マスターを変更しました。次回の同期で既存の予定も書き換わります",
        en: "Master changed. Existing events will be rewritten on the next sync.",
      };
    });
  const setPrivate = (calendarId: string, value: boolean) =>
    call("private", async () => {
      await calendarSyncApi.updateSettings({ privateCalendarId: calendarId, privateValue: value });
      return { ja: "変更しました", en: "Updated." };
    });
  const setColor = (calendarId: string, colorId: string) =>
    call("color", async () => {
      await calendarSyncApi.updateSettings({ colorCalendarId: calendarId, colorId });
      const name = colorOf(colorId)?.name ?? same(colorId);
      return {
        ja: `同期予定の色を「${name.ja}」にしました。次回の同期で、このアカウントの同期予定が書き換わります`,
        en: `Set the color of synced events to "${name.en}". This account's synced events will be rewritten on the next sync.`,
      };
    });
  const remove = (calendarId: string) => {
    if (
      !confirm(
        t({
          ja: `${calendarId} の接続を解除し、このカレンダーにある同期予定を削除します。よろしいですか？`,
          en: `Disconnect ${calendarId} and delete the synced events in this calendar. Continue?`,
        }),
      )
    )
      return;
    void call(`remove:${calendarId}`, async () => {
      const r = await calendarSyncApi.disconnect({ calendarId });
      return {
        ja: `解除しました（同期予定 ${r.deleted} 件を削除${r.failed ? `、${r.failed} 件は削除できませんでした` : ""}）`,
        en: `Disconnected (deleted ${r.deleted} synced events${r.failed ? `; ${r.failed} could not be deleted` : ""}).`,
      };
    });
  };

  const data = status.data;
  const accounts = data?.accounts ?? [];
  const lastRun = data?.lastRun;
  const reconnect = new Set(lastRun?.reconnect ?? []);

  return (
    <div className="flex flex-col gap-6">
      {notice && <AdminNotice ok={notice.ok}>{t(notice.message)}</AdminNotice>}
      {status.isError && <AdminNotice ok={false}>{toApiError(status.error).message || t({ ja: "取得に失敗しました", en: "Failed to load." })}</AdminNotice>}

      <AdminPanel
        title={
          <>
            {t({ ja: "接続しているアカウント", en: "Connected accounts" })}{" "}
            <span className="ms-1 text-body-2-regular text-text-tertiary">{t({ ja: `${accounts.length} 件`, en: `${accounts.length}` })}</span>
          </>
        }
        actions={
          <>
            <ButtonLink href="/api/calendar-sync/connect" variant="primary">
              {t({ ja: "アカウントを接続", en: "Connect account" })}
            </ButtonLink>
            <Button variant="secondary" onClick={runNow} disabled={!!busy || accounts.length < 2}>
              {busy === "run" ? t({ ja: "同期中...", en: "Syncing..." }) : t({ ja: "今すぐ同期", en: "Sync now" })}
            </Button>
          </>
        }
      >
        {accounts.length === 0 ? (
          <p className="text-body-2-regular text-text-tertiary">
            {t({ ja: "まだ接続していません。「アカウントを接続」から 1 つずつ追加してください。", en: "No accounts connected yet. Add them one at a time with “Connect account”." })}
          </p>
        ) : (
          <ul className="divide-y divide-separator-border">
            {accounts.map((a) => {
              const isMaster = data?.master === a.calendarId;
              return (
                <li key={a.calendarId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-body-medium break-all text-text-primary">
                      <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorOf(a.colorId)?.hex ?? "transparent" }} />
                      {a.calendarId}
                      {isMaster && <span className="rounded-md bg-accent-500/15 px-2 py-0.5 text-caption-1-semibold text-accent-300">{t({ ja: "マスター", en: "Master" })}</span>}
                      {reconnect.has(a.calendarId) && (
                        <a
                          href={`/api/calendar-sync/connect?hint=${encodeURIComponent(a.calendarId)}`}
                          className="rounded-md border border-border-error-default px-2 py-0.5 text-caption-1-semibold text-text-error-primary hover:underline"
                        >
                          {t({ ja: "要再接続", en: "Reconnect" })}
                        </a>
                      )}
                    </p>
                    <p className="text-caption-1-regular text-text-tertiary">
                      {t({ ja: "接続", en: "Connected" })}: {new Date(a.connectedAt).toLocaleString(intlLocale(locale))}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <ColorSelect value={a.colorId} onChange={(id) => setColor(a.calendarId, id)} isDisabled={!!busy} />
                    <span title={t({ ja: "マスターに中身を出すとき、予定を非公開にします", en: "Mark events as private when showing their details on the master" })}>
                      <Checkbox size="sm" isSelected={a.private} isDisabled={!!busy} onChange={(v) => setPrivate(a.calendarId, v)}>
                        {t({ ja: "マスターで非公開", en: "Private on master" })}
                      </Checkbox>
                    </span>
                    <Button variant="secondary" size="small" onClick={() => setMaster(isMaster ? null : a.calendarId)} disabled={!!busy}>
                      {isMaster ? t({ ja: "マスター解除", en: "Unset master" }) : t({ ja: "マスターにする", en: "Make master" })}
                    </Button>
                    <Button variant="secondary" size="small" className="text-text-error-primary" onClick={() => remove(a.calendarId)} disabled={!!busy}>
                      {busy === `remove:${a.calendarId}` ? t({ ja: "解除中...", en: "Disconnecting..." }) : t({ ja: "解除", en: "Disconnect" })}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-4 text-caption-1-regular leading-relaxed text-text-tertiary">
          {t({
            ja: "マスターには他のアカウントの予定が中身付き（タイトル・場所・説明・Meet の URL）で入り、それ以外のアカウントには「予定あり」だけが入ります。参加者はコピーしません。過去 1 日から 90 日先までを 5 分ごとに同期します。同期予定はアカウントごとの色で書かれ、どのアカウントに書かれた予定でも同じ色になります（どのカレンダーの予定か見分けられます）。",
            en: "The master receives other accounts' events with their details (title, location, description and Meet URL); every other account receives only “Busy” events. Attendees are never copied. Events from 1 day ago to 90 days ahead are synced every 5 minutes. Synced events are written in each account's color, so an event looks the same in every account it is written to (you can tell which calendar it came from)."
          })}
        </p>
      </AdminPanel>

      {lastRun && (
        <AdminPanel title={t({ ja: "前回の同期", en: "Last sync" })}>
          <p className="-mt-2 mb-4 text-caption-1-regular text-text-tertiary">
            {new Date(lastRun.at).toLocaleString(intlLocale(locale))}
            {t({ ja: `（${(Number(lastRun.durationMs) / 1000).toFixed(1)} 秒）`, en: ` (${(Number(lastRun.durationMs) / 1000).toFixed(1)} s)` })}
          </p>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {(
              [
                [{ ja: "元の予定", en: "Source events" }, lastRun.sourceEvents],
                [{ ja: "同期中の予定", en: "Synced events" }, lastRun.mirrors],
                [{ ja: "書き込み", en: "Written" }, lastRun.writes],
                [{ ja: "削除", en: "Deleted" }, lastRun.deletes],
                [{ ja: "次回に回した分", en: "Deferred" }, lastRun.pending],
              ] as const
            ).map(([label, value]) => (
              <div key={label.ja} className="rounded-xl bg-background-secondary-default p-3">
                <dt className="text-caption-1-medium text-text-tertiary">{t(label)}</dt>
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
              {lastRun.errors.length > 20 && <li className="text-text-tertiary">{t({ ja: `ほか ${lastRun.errors.length - 20} 件`, en: `and ${lastRun.errors.length - 20} more` })}</li>}
            </ul>
          )}
        </AdminPanel>
      )}
    </div>
  );
}
