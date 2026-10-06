import { NextResponse } from "next/server";
import { auth, isAllowedAdmin } from "@/lib/auth";

/**
 * 管理者以外なら 401/403 のレスポンスを返す（管理者なら null）。
 * middleware は /admin のページにしか掛からないので、管理用の API では必ずこれで確認する。
 */
export async function rejectUnlessAdmin(): Promise<NextResponse | null> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!isAllowedAdmin(session.user.email)) {
    return NextResponse.json({ ok: false, error: "not_allowed" }, { status: 403 });
  }
  return null;
}
