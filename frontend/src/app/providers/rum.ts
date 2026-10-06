import { datadogRum } from "@datadog/browser-rum";
import { envName } from "@/shared/config/site";

// Datadog RUM: Core Web Vitals・JS エラー・画面遷移。API 呼び出しには traceparent を付け、ブラウザ → Gateway → Go サービスを 1 本のトレースにつなぐ
const HOSTS = ["taramanji.com", "www.taramanji.com", "gws.taramanji.com", "next.taramanji.com", "stg.taramanji.com", "stg-gws.taramanji.com", "dev.taramanji.com", "dev-gws.taramanji.com"];

export function initRum() {
  const applicationId = import.meta.env.VITE_DD_RUM_APPLICATION_ID;
  const clientToken = import.meta.env.VITE_DD_RUM_CLIENT_TOKEN;
  if (!applicationId || !clientToken || !HOSTS.includes(window.location.hostname)) return;
  datadogRum.init({
    applicationId,
    clientToken,
    site: import.meta.env.VITE_DD_SITE ?? "us5.datadoghq.com",
    service: "web",
    env: envName(),
    version: import.meta.env.VITE_APP_VERSION ?? "dev",
    sessionSampleRate: 100,
    sessionReplaySampleRate: 0,
    trackResources: true,
    trackLongTasks: true,
    trackUserInteractions: true,
    // 入力内容は送らない（お問い合わせ・予約のフォームに個人情報がある）
    defaultPrivacyLevel: "mask-user-input",
    allowedTracingUrls: [{ match: window.location.origin, propagatorTypes: ["tracecontext", "datadog"] }],
  });
}
