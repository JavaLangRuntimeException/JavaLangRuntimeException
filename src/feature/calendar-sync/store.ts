import { getRedis } from "@/lib/redis";
import type { Mirrors, SyncResult } from "./reconcile";

export { decrypt, encrypt } from "./crypto";

// 同期の実行中でも接続・設定変更ができるよう、アカウントと同期記録は別のキーに置く
const ACCOUNTS_KEY = "cal_sync:accounts";
const MIRRORS_KEY = "cal_sync:mirrors";
const LAST_RUN_KEY = "cal_sync:last_run";
const LOCK_KEY = "cal_sync:lock";
const OAUTH_KEY = (state: string) => `cal_sync:oauth:${state}`;

export type Account = {
  calendarId: string;
  /** 暗号化した更新トークン */
  refreshToken: string;
  /** マスターに中身を出すとき「非公開」にする（家族の予定など） */
  private?: boolean;
  connectedAt: string;
};
export type Accounts = { master: string | null; accounts: Account[] };
export type LastRun = SyncResult & { at: string; durationMs: number; reconnect: string[] };

const readJson = async <T>(k: string, fallback: T): Promise<T> => {
  const raw = await getRedis().get(k);
  return raw ? (JSON.parse(raw) as T) : fallback;
};

export const loadAccounts = () => readJson<Accounts>(ACCOUNTS_KEY, { master: null, accounts: [] });
export const saveAccounts = (a: Accounts) => getRedis().set(ACCOUNTS_KEY, JSON.stringify(a));
export const loadMirrors = () => readJson<Mirrors>(MIRRORS_KEY, {});
export const saveMirrors = (m: Mirrors) => getRedis().set(MIRRORS_KEY, JSON.stringify(m));
export const loadLastRun = () => readJson<LastRun | null>(LAST_RUN_KEY, null);
export const saveLastRun = (r: LastRun) => getRedis().set(LAST_RUN_KEY, JSON.stringify(r));

/** 同期と接続解除は同時に走らせない（同期記録を上書きし合うため） */
export async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const redis = getRedis();
  if (!(await redis.set(LOCK_KEY, "1", "EX", 600, "NX"))) throw new LockedError();
  try {
    return await fn();
  } finally {
    await redis.del(LOCK_KEY);
  }
}

export class LockedError extends Error {
  constructor() {
    super("同期の実行中です。少し待ってからやり直してください");
  }
}

/** OAuth の state と PKCE の verifier を 10 分だけ保存する */
export async function saveOAuthState(state: string, verifier: string): Promise<void> {
  await getRedis().set(OAUTH_KEY(state), verifier, "EX", 600);
}

/** 一度しか使えないよう、読むと同時に消す */
export async function takeOAuthState(state: string): Promise<string | null> {
  return getRedis().getdel(OAUTH_KEY(state));
}
