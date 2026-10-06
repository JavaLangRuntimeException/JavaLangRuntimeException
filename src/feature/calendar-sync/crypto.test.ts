import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { decrypt, encrypt } from "./crypto.ts";

process.env.CALENDAR_SYNC_ENC_KEY = randomBytes(32).toString("base64");

test("暗号化した更新トークンを復号できる", () => {
  const token = "1//0e-refresh-token_日本語も可";
  const sealed = encrypt(token);
  assert.notEqual(sealed, token);
  assert.equal(sealed.includes(token), false);
  assert.equal(decrypt(sealed), token);
  assert.notEqual(encrypt(token), sealed); // 毎回 IV が変わる
});

test("改ざんや別の鍵では復号できない", () => {
  const sealed = encrypt("secret");
  const parts = sealed.split(":");
  parts[3] = Buffer.from("tampered").toString("base64");
  assert.throws(() => decrypt(parts.join(":")));
  process.env.CALENDAR_SYNC_ENC_KEY = randomBytes(32).toString("base64");
  assert.throws(() => decrypt(sealed));
});

test("鍵の長さが違えば使わない", () => {
  process.env.CALENDAR_SYNC_ENC_KEY = Buffer.from("short").toString("base64");
  assert.throws(() => encrypt("x"), /32 バイト/);
});
