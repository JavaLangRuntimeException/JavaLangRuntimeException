import type { CalendarEvent, MirrorBody, SyncCalendar } from "./reconcile";

const API = "https://www.googleapis.com/calendar/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
// calendar.events だけで予定の読み書きができる。メールアドレスは userinfo（email スコープ）で取る
export const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events"].join(" ");

export class GoogleApiError extends Error {
  constructor(public status: number, message: string) {
    super(`Google API HTTP ${status}: ${message}`);
  }
}

/** このアプリの正規 URL（calendar-sync では AUTH_URL = https://gws.taramanji.com） */
export function siteUrl(origin: string): string {
  return process.env.AUTH_URL || process.env.NEXTAUTH_URL || origin;
}

/** 接続用の OAuth クライアントに登録するリダイレクト URI */
export function redirectUri(origin: string): string {
  return `${siteUrl(origin)}/api/calendar-sync/callback`;
}

/** アカウント接続用の OAuth クライアント（管理画面ログインと同じ taramanji-calendar-sync のクライアント） */
export function oauthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET が設定されていません");
  return { clientId, clientSecret };
}

async function tokenRequest(form: Record<string, string>): Promise<Record<string, string>> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form),
  });
  const text = await res.text();
  if (!res.ok) throw new GoogleApiError(res.status, text.slice(0, 500));
  return JSON.parse(text);
}

export async function exchangeCode(code: string, verifier: string, redirectUri: string) {
  const { clientId, clientSecret } = oauthClient();
  return tokenRequest({
    client_id: clientId, client_secret: clientSecret, code, code_verifier: verifier,
    redirect_uri: redirectUri, grant_type: "authorization_code",
  });
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = oauthClient();
  const token = await tokenRequest({
    client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token",
  });
  return token.access_token;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 429 / 5xx と、Calendar API が 403 で返すレート制限は待って再試行する */
async function requestJson<T>(url: string, token: string, init: RequestInit = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
    });
    const text = await res.text();
    if (res.ok) return (text ? JSON.parse(text) : {}) as T;
    const rateLimited = res.status === 403 && /rateLimitExceeded|userRateLimitExceeded/.test(text);
    if ((res.status === 429 || res.status >= 500 || rateLimited) && attempt < 4) {
      await sleep(2 ** attempt * 1000);
      continue;
    }
    throw new GoogleApiError(res.status, text.slice(0, 500));
  }
}

/** 接続したアカウント自身のメインカレンダー（ID はメールアドレス） */
export class GoogleCalendar implements SyncCalendar {
  id: string;
  private token: string;

  constructor(id: string, token: string) {
    this.id = id;
    this.token = token;
  }

  static async connect(id: string, refreshToken: string): Promise<GoogleCalendar> {
    return new GoogleCalendar(id, await refreshAccessToken(refreshToken));
  }

  private path(suffix = "") {
    return `${API}/calendars/${encodeURIComponent(this.id)}/events${suffix}`;
  }

  async events(start: string, end: string): Promise<CalendarEvent[]> {
    const params = new URLSearchParams({
      singleEvents: "true", showDeleted: "false", maxResults: "2500", timeMin: start, timeMax: end,
    });
    const result: CalendarEvent[] = [];
    for (;;) {
      const page = await requestJson<{ items?: CalendarEvent[]; nextPageToken?: string }>(`${this.path()}?${params}`, this.token);
      result.push(...(page.items ?? []));
      if (!page.nextPageToken) return result;
      params.set("pageToken", page.nextPageToken);
    }
  }

  async upsert(eventId: string, body: MirrorBody, isNew = false): Promise<void> {
    const data = JSON.stringify({ id: eventId, ...body });
    const put = () => requestJson(this.path(`/${eventId}`), this.token, { method: "PUT", body: data });
    if (isNew) {
      // まだ作っていないはずの予定は作成から（更新→404→作成の 2 往復を省く）。既にあれば 409 なので更新
      try {
        await requestJson(this.path(), this.token, { method: "POST", body: data });
        return;
      } catch (err) {
        if (!(err instanceof GoogleApiError) || err.status !== 409) throw err;
        await put();
        return;
      }
    }
    try {
      await put();
    } catch (err) {
      if (!(err instanceof GoogleApiError) || err.status !== 404) throw err;
      try {
        await requestJson(this.path(), this.token, { method: "POST", body: data });
      } catch (insertErr) {
        if (!(insertErr instanceof GoogleApiError) || insertErr.status !== 409) throw insertErr;
        await put();
      }
    }
  }

  async delete(eventId: string): Promise<void> {
    try {
      await requestJson(this.path(`/${eventId}`), this.token, { method: "DELETE" });
    } catch (err) {
      if (!(err instanceof GoogleApiError) || (err.status !== 404 && err.status !== 410)) throw err;
    }
  }
}

/** OAuth 直後に、そのアカウントのメインカレンダー ID（= アカウントのメールアドレス）を調べる */
export async function primaryCalendarId(accessToken: string): Promise<string> {
  const user = await requestJson<{ email?: string; email_verified?: boolean }>(
    "https://openidconnect.googleapis.com/v1/userinfo", accessToken,
  );
  if (!user.email || user.email_verified === false) throw new Error("メールアドレスを取得できませんでした");
  return user.email;
}
