// カレンダー同期の管理画面だけを出すホスト（それ以外のパスは Gateway が本体のサイトへ 308 で転送する）
export const CALENDAR_HOSTS = ["gws.taramanji.com", "dev-gws.taramanji.com"];

export const isCalendarHost = () => CALENDAR_HOSTS.includes(window.location.hostname);

/** いまの環境のサイトと管理画面の URL（dev では dev.taramanji.com / dev-gws.taramanji.com） */
export function siteOrigins() {
  const dev = window.location.hostname.startsWith("dev.") || window.location.hostname.startsWith("dev-gws.");
  return dev
    ? { site: "https://dev.taramanji.com", calendar: "https://dev-gws.taramanji.com" }
    : { site: "https://taramanji.com", calendar: "https://gws.taramanji.com" };
}
