// taramanji.com の前に立ち、オリジン（Cloudflare Tunnel → 自宅の kind）が落ちているときだけ
// Cloudflare の素っ気ないエラー画面の代わりに「メンテナンス中」の画面を返す。
// 動いているときはリクエストをそのまま通す（中身には触らない）
import { MAINTENANCE_HTML } from "./page.js";

// オリジンに届かないときの状態。500 はアプリのエラーなのでそのまま返す
//  502/503/504: Envoy Gateway の上流がいない・時間切れ
//  520〜527: Cloudflare とオリジンの間の失敗、530: Tunnel（cloudflared）がつながっていない（1033）
const ORIGIN_DOWN = new Set([502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 527, 530]);

export default {
  async fetch(req, _env, ctx) {
    // Worker 自体がこけても、素通しにしてサイトを止めない
    ctx.passThroughOnException();
    let res;
    try {
      res = await fetch(req);
    } catch {
      return fallback(req, null);
    }
    return ORIGIN_DOWN.has(res.status) ? fallback(req, res) : res;
  },
};

// 人がページを開いたとき（ナビゲーション）だけ画面を出す。API や画像などは元の応答のまま返す
export function isPageRequest(req) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const mode = req.headers.get("Sec-Fetch-Mode");
  if (mode) return mode === "navigate";
  return (req.headers.get("Accept") || "").includes("text/html");
}

export function fallback(req, res) {
  if (!isPageRequest(req)) {
    return res || new Response("Service Unavailable", { status: 503, headers: { "Retry-After": "60" } });
  }
  return new Response(req.method === "HEAD" ? null : MAINTENANCE_HTML, {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Retry-After": "60",
      "X-Robots-Tag": "noindex",
      "X-Taramanji-Maintenance": "1",
      "X-Origin-Status": String(res?.status ?? "unreachable"),
    },
  });
}
