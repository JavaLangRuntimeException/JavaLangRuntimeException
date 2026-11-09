import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { fallback, isPageRequest } from "./index.js";

const ctx = { passThroughOnException() {} };
const page = (url = "https://taramanji.com/", init = {}) =>
  new Request(url, { ...init, headers: { "Sec-Fetch-Mode": "navigate", Accept: "text/html", ...(init.headers || {}) } });

async function run(req, origin) {
  const orig = globalThis.fetch;
  globalThis.fetch = origin;
  try { return await worker.fetch(req, {}, ctx); } finally { globalThis.fetch = orig; }
}

test("動いているときは元の応答をそのまま返す", async () => {
  const ok = new Response("hello", { status: 200 });
  assert.equal(await run(page(), async () => ok), ok);
});

test("アプリの 500 と 4xx は差し替えない", async () => {
  for (const status of [500, 404, 403]) {
    const r = await run(page(), async () => new Response("x", { status }));
    assert.equal(r.status, status);
    assert.equal(r.headers.get("X-Taramanji-Maintenance"), null);
  }
});

test("Tunnel が切れている（530）・上流がいない（502/503）ときはメンテナンス画面", async () => {
  for (const status of [502, 503, 504, 522, 530]) {
    const r = await run(page(), async () => new Response("cf error", { status }));
    assert.equal(r.status, 503);
    assert.equal(r.headers.get("X-Taramanji-Maintenance"), "1");
    assert.equal(r.headers.get("X-Origin-Status"), String(status));
    assert.equal(r.headers.get("Cache-Control"), "no-store");
    assert.match(await r.text(), /ただいまメンテナンス中です/);
  }
});

test("fetch が投げたときもメンテナンス画面", async () => {
  const r = await run(page(), async () => { throw new Error("boom"); });
  assert.equal(r.status, 503);
  assert.equal(r.headers.get("X-Origin-Status"), "unreachable");
});

test("API・画像・POST は差し替えず元の応答を返す", async () => {
  const api = new Request("https://taramanji.com/api/x", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  const bad = new Response("bad gateway", { status: 502 });
  assert.equal(await run(api, async () => bad), bad);
  const img = new Request("https://taramanji.com/a.png", { headers: { "Sec-Fetch-Mode": "no-cors", Accept: "image/*" } });
  assert.equal((await run(img, async () => new Response("", { status: 530 }))).status, 530);
  const thrown = await run(api, async () => { throw new Error("x"); });
  assert.equal(thrown.status, 503);
  assert.equal(thrown.headers.get("X-Taramanji-Maintenance"), null);
});

test("ページかどうか: Sec-Fetch-Mode を優先し、無ければ Accept で見る", () => {
  assert.equal(isPageRequest(page()), true);
  assert.equal(isPageRequest(new Request("https://t/", { headers: { "Sec-Fetch-Mode": "cors", Accept: "text/html" } })), false);
  assert.equal(isPageRequest(new Request("https://t/", { headers: { Accept: "text/html,*/*" } })), true);
  assert.equal(isPageRequest(new Request("https://t/", { headers: { Accept: "*/*" } })), false);
});

test("HEAD には本文を付けない", async () => {
  const r = fallback(page("https://taramanji.com/", { method: "HEAD" }), null);
  assert.equal(r.status, 503);
  assert.equal(await r.text(), "");
});
