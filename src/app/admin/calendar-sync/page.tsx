"use client";

import { useSession, signOut } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { LastRun } from "../../../feature/calendar-sync/store";

type AccountView = { calendarId: string; private: boolean; connectedAt: string };
type Status = { ok: boolean; error?: string; master?: string | null; accounts?: AccountView[]; lastRun?: LastRun | null };
type Notice = { ok: boolean; message: string };

const card = "bg-gray-800/50 backdrop-blur-lg rounded-xl p-4 border border-gray-700";

export default function CalendarSyncPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<Status | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (status !== "loading" && !session?.user?.email) router.push("/admin/login");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, status]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/calendar-sync");
      setData(await res.json());
    } catch {
      setData({ ok: false, error: "取得に失敗しました" });
    }
  }, []);

  useEffect(() => {
    if (!session?.user?.email) return;
    refresh();
    // OAuth から戻ってきたときの結果を表示して、URL からは消す
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const error = params.get("error");
    if (connected) setNotice({ ok: true, message: `接続しました: ${connected}` });
    if (error) setNotice({ ok: false, message: error });
    if (connected || error) window.history.replaceState(null, "", window.location.pathname);
  }, [session, refresh]);

  const call = async (label: string, init: RequestInit, done: (body: Record<string, unknown>) => string) => {
    setBusy(label);
    setNotice(null);
    try {
      const res = await fetch("/api/calendar-sync", { headers: { "Content-Type": "application/json" }, ...init });
      const body = await res.json();
      setNotice(res.ok ? { ok: body.ok !== false, message: done(body) } : { ok: false, message: body.error || "失敗しました" });
      await refresh();
    } catch {
      setNotice({ ok: false, message: "エラーが発生しました" });
    } finally {
      setBusy(null);
    }
  };

  const runNow = () => call("run", { method: "POST" }, (body) => {
    const r = body.result as LastRun;
    return `同期しました（書き込み ${r.writes} 件・削除 ${r.deletes} 件${r.errors.length ? `・エラー ${r.errors.length} 件` : ""}）`
      + (r.pending ? `。残り ${r.pending} 件は 5 分ごとの自動同期で続けます` : "");
  });
  const setMaster = (master: string | null) =>
    call("master", { method: "PATCH", body: JSON.stringify({ master }) }, () => "マスターを変更しました。次回の同期で既存の予定も書き換わります");
  const setPrivate = (calendarId: string, value: boolean) =>
    call("private", { method: "PATCH", body: JSON.stringify({ private: { calendarId, value } }) }, () => "変更しました");
  const remove = (calendarId: string) => {
    if (!confirm(`${calendarId} の接続を解除し、このカレンダーにある同期予定を削除します。よろしいですか？`)) return;
    call(`remove:${calendarId}`, { method: "DELETE", body: JSON.stringify({ calendarId }) }, (body) =>
      `解除しました（同期予定 ${body.deleted} 件を削除${body.failed ? `、${body.failed} 件は削除できませんでした` : ""}）`);
  };

  if (status === "loading" || !session) return <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black" />;

  const accounts = data?.accounts ?? [];
  const lastRun = data?.lastRun;
  const reconnect = new Set(lastRun?.reconnect ?? []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black">
      <header className="bg-gray-800/50 backdrop-blur-lg border-b border-gray-700">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <a href="https://taramanji.com/admin" className="text-gray-400 hover:text-white text-sm">サイトの管理画面 →</a>
            <h1 className="text-xl font-bold text-white">カレンダー同期</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-gray-300 text-sm">{session.user?.email}</span>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium"
            >
              ログアウト
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {notice && (
          <div className={`rounded-xl p-4 text-sm border break-all ${notice.ok ? "bg-green-900/30 border-green-700 text-green-200" : "bg-red-900/30 border-red-700 text-red-200"}`}>
            {notice.message}
          </div>
        )}
        {data && !data.ok && (
          <div className="bg-red-900/40 border border-red-700 text-red-200 rounded-xl p-4 text-sm break-all">{data.error}</div>
        )}

        <section className={card}>
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <h2 className="text-white font-semibold">
              接続しているアカウント <span className="text-gray-400 font-normal text-sm">{accounts.length} 件</span>
            </h2>
            <div className="flex gap-2">
              <a href="/api/calendar-sync/connect" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
                ＋ アカウントを接続
              </a>
              <button
                onClick={runNow}
                disabled={!!busy || accounts.length < 2}
                className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50"
              >
                {busy === "run" ? "同期中..." : "今すぐ同期"}
              </button>
            </div>
          </div>

          {accounts.length === 0 ? (
            <p className="text-gray-400 text-sm">まだ接続していません。「アカウントを接続」から 1 つずつ追加してください。</p>
          ) : (
            <ul className="divide-y divide-gray-700/70">
              {accounts.map((a) => {
                const isMaster = data?.master === a.calendarId;
                return (
                  <li key={a.calendarId} className="py-3 flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-white break-all">
                        {a.calendarId}
                        {isMaster && <span className="ml-2 px-2 py-0.5 rounded bg-blue-600/30 text-blue-200 text-xs">マスター</span>}
                        {reconnect.has(a.calendarId) && (
                          <a href={`/api/calendar-sync/connect?hint=${encodeURIComponent(a.calendarId)}`} className="ml-2 px-2 py-0.5 rounded bg-yellow-600/30 text-yellow-200 text-xs hover:underline">
                            要再接続
                          </a>
                        )}
                      </p>
                      <p className="text-gray-500 text-xs">接続: {new Date(a.connectedAt).toLocaleString("ja-JP")}</p>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <label className="flex items-center gap-1 text-gray-300" title="マスターに中身を出すとき、予定を非公開にします">
                        <input type="checkbox" checked={a.private} disabled={!!busy} onChange={(e) => setPrivate(a.calendarId, e.target.checked)} />
                        マスターで非公開
                      </label>
                      <button
                        onClick={() => setMaster(isMaster ? null : a.calendarId)}
                        disabled={!!busy}
                        className="px-3 py-1 bg-gray-700 text-white rounded hover:bg-gray-600 disabled:opacity-50"
                      >
                        {isMaster ? "マスター解除" : "マスターにする"}
                      </button>
                      <button
                        onClick={() => remove(a.calendarId)}
                        disabled={!!busy}
                        className="px-3 py-1 bg-red-700/70 text-white rounded hover:bg-red-700 disabled:opacity-50"
                      >
                        {busy === `remove:${a.calendarId}` ? "解除中..." : "解除"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-gray-500 text-xs mt-4 leading-relaxed">
            マスターには他のアカウントの予定が中身付き（タイトル・場所・説明・Meet の URL）で入り、それ以外のアカウントには「予定あり」だけが入ります。
            参加者はコピーしません。過去 1 日から 90 日先までを 5 分ごとに同期します。
          </p>
        </section>

        {lastRun && (
          <section className={card}>
            <h2 className="text-white font-semibold mb-1">前回の同期</h2>
            <p className="text-gray-400 text-xs mb-3">
              {new Date(lastRun.at).toLocaleString("ja-JP")}（{(lastRun.durationMs / 1000).toFixed(1)} 秒）
            </p>
            <dl className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
              {[
                ["元の予定", lastRun.sourceEvents],
                ["同期中の予定", lastRun.mirrors],
                ["書き込み", lastRun.writes],
                ["削除", lastRun.deletes],
                ["次回に回した分", lastRun.pending],
              ].map(([label, value]) => (
                <div key={label as string} className="bg-gray-900/50 rounded-lg p-3">
                  <dt className="text-gray-400 text-xs">{label}</dt>
                  <dd className="text-white text-lg font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
            {lastRun.errors.length > 0 && (
              <ul className="mt-4 text-xs text-red-300 space-y-1">
                {lastRun.errors.slice(0, 20).map((e, i) => <li key={i} className="break-all">{e.calendarId}: {e.error}</li>)}
                {lastRun.errors.length > 20 && <li className="text-gray-400">ほか {lastRun.errors.length - 20} 件</li>}
              </ul>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
