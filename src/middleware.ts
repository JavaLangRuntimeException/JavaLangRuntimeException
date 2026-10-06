import NextAuth from "next-auth";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { authConfig } from "../auth.config";

// gws.taramanji.com はカレンダー同期の管理画面（/admin）専用。それ以外は taramanji.com へ転送する
const CALENDAR_HOST = "gws.taramanji.com";
const MAIN_SITE = "https://taramanji.com";
// gws でも必要なもの: ログイン、カレンダー同期の API・OAuth、Next.js の内部ファイル
const CALENDAR_HOST_PATHS = ["/admin/login", "/api/auth/", "/api/calendar-sync", "/_next/"];

const authMiddleware = NextAuth(authConfig).auth as unknown as (req: NextRequest, ev: NextFetchEvent) => Promise<Response | undefined>;

function hostOf(req: NextRequest): string {
  return (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").split(":")[0].toLowerCase();
}

/** /admin 配下はログイン必須（auth.config.ts の authorized）。通ったら null */
async function requireAdmin(req: NextRequest, ev: NextFetchEvent): Promise<Response | null> {
  const res = await authMiddleware(req, ev);
  return res && !res.headers.get("x-middleware-next") ? res : null;
}

export default async function middleware(req: NextRequest, ev: NextFetchEvent) {
  const { pathname, search } = req.nextUrl;
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");

  if (hostOf(req) === CALENDAR_HOST) {
    if (pathname === "/admin") {
      return (await requireAdmin(req, ev)) ?? NextResponse.rewrite(new URL("/admin/calendar-sync", req.url));
    }
    if (CALENDAR_HOST_PATHS.some((p) => pathname === p || pathname.startsWith(p))) {
      return isAdmin ? ((await requireAdmin(req, ev)) ?? NextResponse.next()) : NextResponse.next();
    }
    // gws の /admin はカレンダー同期だけ（/admin/calendar-sync も /admin に寄せる）
    if (isAdmin) return NextResponse.redirect(`https://${CALENDAR_HOST}/admin${search}`);
    return NextResponse.redirect(`${MAIN_SITE}${pathname}${search}`, 308);
  }

  // taramanji.com の /admin は今までの管理機能だけ。カレンダー同期は gws へ
  if (pathname === "/admin/calendar-sync") {
    return NextResponse.redirect(`https://${CALENDAR_HOST}/admin${search}`);
  }
  if (isAdmin) return (await requireAdmin(req, ev)) ?? NextResponse.next();
  return NextResponse.next();
}

export const config = {
  // 静的ファイル（拡張子付き）と画像最適化以外のすべて
  matcher: ["/((?!_next/static|_next/image|.*\\.[A-Za-z0-9]+$).*)"],
};
