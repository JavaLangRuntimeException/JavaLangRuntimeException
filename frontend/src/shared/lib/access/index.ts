import { ACCESS_TEAM_DOMAIN } from "@/shared/config/site";

/**
 * Cloudflare Access からログアウトする。
 * このホストのセッション（/cdn-cgi/access/logout）を消してから、チームのドメインでもログアウトする。
 * チームのドメイン側を消さないと、次のログインでも前の Google アカウントがそのまま使われる
 */
export async function signOutAccess() {
  try {
    await fetch("/cdn-cgi/access/logout", { credentials: "same-origin", redirect: "manual" });
  } catch {
    // ローカルの開発サーバーなど Access がない所では何もしない
  }
  window.location.assign(`https://${ACCESS_TEAM_DOMAIN}/cdn-cgi/access/logout`);
}
