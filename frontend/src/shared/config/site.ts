// 環境ごとのホスト名。サイト本体と、カレンダー同期の管理画面だけを出すホスト（gws）が 1 組
//   prod: taramanji.com / gws.taramanji.com
//   stg:  stg.taramanji.com / stg-gws.taramanji.com
//   dev:  dev.taramanji.com / dev-gws.taramanji.com
// （gws.stg.taramanji.com のような 2 段にしないのは、Cloudflare の無料の証明書 *.taramanji.com が 1 段までしか効かないため）
const ENVS = [
  { prefix: "dev", site: "dev.taramanji.com", calendar: "dev-gws.taramanji.com" },
  { prefix: "stg", site: "stg.taramanji.com", calendar: "stg-gws.taramanji.com" },
] as const;
const PROD = { site: "taramanji.com", calendar: "gws.taramanji.com" };

function current() {
  const host = window.location.hostname;
  return ENVS.find((e) => host === e.site || host === e.calendar) ?? PROD;
}

export const CALENDAR_HOSTS = [PROD.calendar, ...ENVS.map((e) => e.calendar)];

export const isCalendarHost = () => CALENDAR_HOSTS.includes(window.location.hostname);

/** いまの環境のサイトと管理画面の URL */
export function siteOrigins() {
  const e = current();
  return { site: `https://${e.site}`, calendar: `https://${e.calendar}` };
}

/** Datadog の env タグ（RUM） */
export function envName(): "prod" | "stg" | "dev" | "staging" {
  const host = window.location.hostname;
  if (host === "next.taramanji.com") return "staging";
  const e = ENVS.find((x) => host === x.site || host === x.calendar);
  return e ? e.prefix : "prod";
}
