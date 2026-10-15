import { test } from "node:test";
import assert from "node:assert/strict";
import { next, probe, rawMessage } from "./index.js";

const ok = { ok: true }, ng = { ok: false };

test("2 回続けて失敗したら down を 1 回だけ送り、戻ったら recovered を送る", () => {
  let s = null;
  const step = (r, t) => { const o = next(s, r, 2, t); if (o.state) s = o.state; return o.mail; };
  assert.equal(step(ok, "t0"), null);
  assert.equal(step(ng, "t1"), null);
  assert.equal(step(ng, "t2"), "down");
  assert.equal(s.since, "t1");
  assert.equal(step(ng, "t3"), null);
  assert.equal(step(ok, "t4"), "recovered");
  assert.equal(step(ok, "t5"), null);
});

test("1 回だけの失敗では送らず、戻ったら数え直す", () => {
  let s = null;
  const step = (r, t) => { const o = next(s, r, 2, t); if (o.state) s = o.state; return o.mail; };
  assert.equal(step(ng, "t1"), null);
  assert.equal(step(ok, "t2"), null);
  assert.equal(step(ng, "t3"), null);
  assert.equal(s.fails, 1);
});

test("動いている間は状態を書かない（KV の書き込みを減らす）", () => {
  assert.equal(next({ down: false, fails: 0, since: "t0" }, ok, 2, "t1").state, null);
});

test("5xx と例外は失敗、3xx・4xx は動いている", async () => {
  const f = (status) => async () => new Response(null, { status });
  assert.equal((await probe("https://x/", f(502))).ok, false);
  assert.equal((await probe("https://x/", f(530))).ok, false);
  assert.equal((await probe("https://x/", f(308))).ok, true);
  assert.equal((await probe("https://x/", f(404))).ok, true);
  assert.equal((await probe("https://x/", async () => { throw new Error("boom"); })).ok, false);
});

test("件名と本文を UTF-8 の base64 にする", () => {
  const raw = rawMessage("a@x", "b@x", "落ちています", "本文");
  assert.match(raw, /^From: a@x\r\nTo: b@x\r\nSubject: =\?UTF-8\?B\?/);
  const body = raw.split("\r\n\r\n")[1].replace(/\r\n/g, "");
  assert.equal(new TextDecoder().decode(Uint8Array.from(atob(body), (c) => c.charCodeAt(0))), "本文");
});
