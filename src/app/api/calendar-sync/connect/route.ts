import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { rejectUnlessAdmin } from "@/lib/admin-guard";
import { GOOGLE_AUTH_URL, oauthClient, redirectUri, SCOPES } from "@/feature/calendar-sync/google";
import { saveOAuthState } from "@/feature/calendar-sync/store";

export const dynamic = "force-dynamic";

// GET: Google の同意画面へ。?hint=メールアドレス で選ぶアカウントを指定できる
export async function GET(req: NextRequest) {
  const denied = await rejectUnlessAdmin();
  if (denied) return denied;
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(64).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  await saveOAuthState(state, verifier);
  const hint = req.nextUrl.searchParams.get("hint");
  const url = `${GOOGLE_AUTH_URL}?${new URLSearchParams({
    client_id: oauthClient().clientId,
    redirect_uri: redirectUri(req.nextUrl.origin),
    response_type: "code",
    scope: SCOPES,
    // 更新トークンを毎回もらうため consent。追加するアカウントを選び直せるよう select_account も付ける
    access_type: "offline",
    prompt: "consent select_account",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    ...(hint ? { login_hint: hint } : {}),
  })}`;
  return NextResponse.redirect(url);
}
