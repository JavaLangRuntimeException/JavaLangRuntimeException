import { NextRequest, NextResponse } from "next/server";
import { rejectUnlessAdmin } from "@/lib/admin-guard";
import { exchangeCode, primaryCalendarId, redirectUri, siteUrl } from "@/feature/calendar-sync/google";
import { encrypt, loadAccounts, saveAccounts, takeOAuthState } from "@/feature/calendar-sync/store";

export const dynamic = "force-dynamic";

// GET: Google から戻ってきたら、更新トークンを暗号化して保存する
export async function GET(req: NextRequest) {
  const denied = await rejectUnlessAdmin();
  if (denied) return denied;
  const params = req.nextUrl.searchParams;
  const back = (query: Record<string, string>) =>
    NextResponse.redirect(`${siteUrl(req.nextUrl.origin)}/admin?${new URLSearchParams(query)}`);

  if (params.get("error")) return back({ error: `Google: ${params.get("error")}` });
  const verifier = await takeOAuthState(params.get("state") || "");
  if (!verifier) return back({ error: "認証の有効期限が切れました。もう一度接続してください" });

  try {
    const token = await exchangeCode(params.get("code") || "", verifier, redirectUri(req.nextUrl.origin));
    if (!token.refresh_token) return back({ error: "更新トークンを受け取れませんでした。もう一度接続してください" });
    const calendarId = await primaryCalendarId(token.access_token);
    const data = await loadAccounts();
    const existing = data.accounts.find((a) => a.calendarId === calendarId);
    if (existing) {
      // 再接続: トークンだけ入れ替え、設定は残す
      existing.refreshToken = encrypt(token.refresh_token);
      existing.connectedAt = new Date().toISOString();
    } else {
      data.accounts.push({ calendarId, refreshToken: encrypt(token.refresh_token), connectedAt: new Date().toISOString() });
    }
    await saveAccounts(data);
    return back({ connected: calendarId });
  } catch (error) {
    console.error("[calendar-sync] connect failed:", error);
    return back({ error: error instanceof Error ? error.message.slice(0, 200) : "接続に失敗しました" });
  }
}
