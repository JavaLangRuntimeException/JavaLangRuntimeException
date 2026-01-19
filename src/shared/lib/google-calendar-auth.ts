/**
 * Google Calendar認証関連の共通関数
 */

/**
 * リクエストからGoogle Calendarのアクセストークンを取得
 * クッキーまたはリフレッシュトークンを使用
 */
export async function getAccessTokenFromRequest(req: Request): Promise<string | null> {
  // try cookie access token first
  const cookiesHeader = req.headers.get("cookie") || "";
  const cookiePairs = cookiesHeader
    .split(/;\s*/)
    .map((c) => c.split("=") as [string, string])
    .filter((a) => a.length === 2)
    .map(([k, v]) => [decodeURIComponent(k), decodeURIComponent(v)] as [string, string]);
  const cookieMap = Object.fromEntries(cookiePairs) as Record<string, string>;

  const accessToken = cookieMap["gcal_access_token"];
  const exp = Number(cookieMap["gcal_token_exp"] || 0);
  if (accessToken && Date.now() < exp - 60_000) return accessToken;

  // refresh via cookie refresh token or env refresh token
  const refreshToken = cookieMap["gcal_refresh_token"] || process.env.GOOGLE_REFRESH_TOKEN || "";
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  if (!refreshToken || !clientId || !clientSecret) return null;

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    const tokens: { access_token?: string } = await tokenRes.json();
    return tokens.access_token || null;
  } catch {
    return null;
  }
}

/**
 * サービスアカウントからGoogle Calendarのアクセストークンを取得
 */
export async function getServiceAccountAccessToken(
  clientEmail: string,
  privateKey: string,
  subject?: string,
  scope: string = "https://www.googleapis.com/auth/calendar"
): Promise<string | null> {
  try {
    const header = { alg: "RS256", typ: "JWT" };
    const now = Math.floor(Date.now() / 1000);
    const claim = {
      iss: clientEmail,
      scope,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
      ...(subject ? { sub: subject } : {}),
    } as Record<string, string | number>;

    const enc = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString("base64url");
    const unsigned = `${enc(header)}.${enc(claim)}`;
    const crypto = await import("node:crypto");
    const signer = crypto.createSign("RSA-SHA256");
    signer.update(unsigned);
    const signature = signer.sign(privateKey).toString("base64url");
    const assertion = `${unsigned}.${signature}`;

    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    if (!resp.ok) return null;
    const data: { access_token?: string } = await resp.json();
    return data.access_token || null;
  } catch {
    return null;
  }
}

/**
 * 環境変数からサービスアカウントJSONを取得してアクセストークンを取得
 * @param scope スコープ（デフォルト: calendar）
 */
export async function getAccessTokenFromServiceAccount(
  scope: string = "https://www.googleapis.com/auth/calendar"
): Promise<string | null> {
  const saJsonB64 = process.env.GCAL_SA_JSON_BASE64;
  if (!saJsonB64) return null;

  let saJson: string | undefined;
  try {
    saJson = Buffer.from(saJsonB64, "base64").toString("utf8");
  } catch (err) {
    console.error("Failed to decode service account JSON from base64", err);
    return null;
  }

  if (!saJson) return null;

  try {
    const parsed = JSON.parse(saJson);
    const emailFromJson: string | undefined = parsed.client_email;
    const keyFromJson: string | undefined = parsed.private_key;
    if (emailFromJson && keyFromJson) {
      return await getServiceAccountAccessToken(emailFromJson, String(keyFromJson), undefined, scope);
    }
  } catch (err) {
    console.error("Failed to parse service account JSON or get token", err);
  }

  return null;
}

/**
 * リクエストまたはサービスアカウントからアクセストークンを取得
 * 優先順位: サービスアカウント > リクエストからの取得
 * @param req リクエスト
 * @param scope スコープ（デフォルト: calendar）
 */
export async function getGoogleCalendarAccessToken(
  req: Request,
  scope: string = "https://www.googleapis.com/auth/calendar"
): Promise<string | null> {
  // まずサービスアカウントを試す
  const saToken = await getAccessTokenFromServiceAccount(scope);
  if (saToken) {
    return saToken;
  }

  // サービスアカウントがなければリクエストから取得
  return await getAccessTokenFromRequest(req);
}
