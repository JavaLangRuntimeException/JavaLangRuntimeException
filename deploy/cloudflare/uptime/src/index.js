// 外形監視と Datadog の通知を、予約のメールと同じ SES（FROM_EMAIL）から NOTIFY_EMAIL に送る。
// kind（Mac の OrbStack）の外で動くので、クラスターごと落ちても知らせられる
import { AwsClient } from "aws4fetch";

const TIMEOUT_MS = 10_000;

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(checkAll(env));
  },
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "POST" && url.pathname === "/datadog") return datadog(req, env);
    return new Response("not found", { status: 404 });
  },
};

// 1 つの URL を見る。5xx・つながらない・時間切れを失敗とする
export async function probe(target, fetcher = fetch) {
  try {
    const res = await fetcher(target, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS), cf: { cacheTtl: 0 } });
    return res.status < 500 ? { ok: true, detail: `HTTP ${res.status}` } : { ok: false, detail: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, detail: e?.name === "TimeoutError" ? `${TIMEOUT_MS / 1000} 秒で返らない` : String(e?.message || e) };
  }
}

// 前の状態と今回の結果から、次の状態と送るメール（なければ null）を決める。
// 状態 { down: bool, fails: 数, since: ISO } は変わったときだけ保存する（writes を減らすため null なら保存しない）
export function next(prev, result, threshold, now) {
  const s = prev || { down: false, fails: 0, since: now };
  if (result.ok) {
    if (s.down) return { state: { down: false, fails: 0, since: now }, mail: "recovered" };
    return { state: s.fails ? { down: false, fails: 0, since: s.since } : null, mail: null };
  }
  if (s.down) return { state: null, mail: null };
  const fails = s.fails + 1;
  const since = s.fails ? s.since : now;
  if (fails >= threshold) return { state: { down: true, fails, since }, mail: "down" };
  return { state: { down: false, fails, since }, mail: null };
}

async function checkAll(env) {
  const threshold = Number(env.FAIL_THRESHOLD || 2);
  const now = new Date().toISOString();
  for (const target of env.TARGETS.split(",").map((t) => t.trim()).filter(Boolean)) {
    // 1 つの失敗（SES のエラーなど）で、ほかの URL を見るのを止めない
    await checkOne(env, target, threshold, now).catch((e) => console.error(target, e));
  }
}

async function checkOne(env, target, threshold, now) {
  {
    const result = await probe(target);
    const key = `target:${target}`;
    const prev = await env.STATE.get(key, "json");
    const { state, mail } = next(prev, result, threshold, now);
    if (mail === "down") {
      await sendMail(env, `【taramanji】${host(target)} が落ちています`,
        `${target} に ${state.fails} 分続けてつながりません（${result.detail}）。\n落ち始め: ${jst(state.since)}\n\n` +
        `確認: kubectl get pods -A / OrbStack のメモリ / cloudflared\n手順: deploy/k8s/README.md`);
    } else if (mail === "recovered") {
      await sendMail(env, `【taramanji】${host(target)} が戻りました`,
        `${target} が応答しています（${result.detail}）。\n落ちていた時間: ${jst(prev.since)} 〜 ${jst(now)}`);
    }
    // メールを送れなかったときは状態を進めない（次の分にもう一度送る）
    if (state) await env.STATE.put(key, JSON.stringify(state));
  }
}

// Datadog の webhook（本文はモニターの $EVENT_TITLE と $EVENT_MSG などを JSON にしたもの）
async function datadog(req, env) {
  if (!env.WEBHOOK_TOKEN || req.headers.get("X-Webhook-Token") !== env.WEBHOOK_TOKEN) {
    return new Response("forbidden", { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const title = String(body.title || "Datadog のアラート").slice(0, 200);
  const text = [body.message, body.link && `Datadog: ${body.link}`].filter(Boolean).join("\n\n");
  await sendMail(env, `【taramanji】${title}`, text || title);
  return new Response("ok");
}

// SES の SendRawEmail（notification サービスと同じ API・同じ権限）で送る
export function rawMessage(from, to, subject, text) {
  const b64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
  const body = b64(text).replace(/.{76}/g, "$&\r\n");
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${b64(subject)}?=`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    body,
    "",
  ].join("\r\n");
}

async function sendMail(env, subject, text) {
  const aws = new AwsClient({
    accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    service: "ses", region: env.AWS_REGION,
  });
  const raw = rawMessage(env.FROM_EMAIL, env.NOTIFY_EMAIL, subject, text);
  const form = new URLSearchParams({
    Action: "SendRawEmail", Version: "2010-12-01", Source: env.FROM_EMAIL,
    "Destinations.member.1": env.NOTIFY_EMAIL,
    "RawMessage.Data": btoa(String.fromCharCode(...new TextEncoder().encode(raw))),
  });
  // aws4fetch は URLSearchParams を署名できない（文字列・バイト列だけ）。toString() しないと Worker が 500 になる
  const res = await aws.fetch(`https://email.${env.AWS_REGION}.amazonaws.com/`, {
    method: "POST", body: form.toString(), headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  if (!res.ok) throw new Error(`SES ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

const host = (u) => new URL(u).host;
const jst = (iso) => new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
