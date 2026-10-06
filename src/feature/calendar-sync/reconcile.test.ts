// 実行: pnpm test:calendar-sync（node --test。型は Node の type stripping で除去）
// 前半は calendar-busy-sync の tests/test_sync.py の移植
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  MARKER, mirrorId, reconcile, removeMirrorsIn,
  type CalendarEvent, type MirrorBody, type Mirrors, type SyncCalendar,
} from "./reconcile.ts";

function event(id: string, extra: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id, status: "confirmed", transparency: "opaque",
    start: { dateTime: "2026-10-02T10:00:00+09:00" }, end: { dateTime: "2026-10-02T11:00:00+09:00" },
    ...extra,
  };
}

class FakeCalendar implements SyncCalendar {
  writes: [string, MirrorBody][] = [];
  deletes: string[] = [];
  failList = false;
  failWrite = false;
  id: string;
  items: CalendarEvent[];
  constructor(id: string, items: CalendarEvent[]) {
    this.id = id;
    this.items = items;
  }
  async events() {
    if (this.failList) throw new Error("invalid_grant");
    return structuredClone(this.items);
  }
  newFlags: boolean[] = [];
  async upsert(id: string, body: MirrorBody, isNew?: boolean) {
    if (this.failWrite) throw new Error("HTTP 403");
    this.writes.push([id, body]);
    this.newFlags.push(!!isNew);
  }
  async delete(id: string) {
    this.deletes.push(id);
  }
  written(id: string) {
    return Object.fromEntries(this.writes)[id];
  }
}

let a: FakeCalendar;
let b: FakeCalendar;
let state: { master?: string | null; mirrors: Mirrors };
let now: Date;
const sync = (calendars: SyncCalendar[] = [a, b], opts = {}) => reconcile(calendars, state, { now, ...opts });

beforeEach(() => {
  a = new FakeCalendar("a@example.com", [event("e1", { summary: "Secret A", description: "Private" })]);
  b = new FakeCalendar("b@example.com", [event("e2", { summary: "Secret B" })]);
  state = { mirrors: {} };
  now = new Date(Date.UTC(2026, 9, 1));
});

test("双方向・非公開・冪等", async () => {
  assert.equal((await sync()).mirrors, 2);
  assert.equal(a.writes.length, 1);
  assert.equal(b.writes.length, 1);
  const [id, body] = b.writes[0];
  assert.equal(id, mirrorId(a.id, "e1", b.id));
  assert.equal(body.summary, "予定あり");
  assert.equal(body.visibility, "private");
  assert.equal(body.transparency, "opaque");
  assert.equal(body.description, undefined);
  assert.equal(body.extendedProperties.private[MARKER], "a@example.com:e1");
  await sync();
  assert.equal(a.writes.length, 1);
  assert.equal(b.writes.length, 1);
});

test("予定 ID は calendar-busy-sync（Python）と同じ", () => {
  // python3 -c 'import hashlib,json; print("b"+hashlib.sha256(json.dumps(["a@example.com","e1","b@example.com"],separators=(",",":")).encode()).hexdigest())'
  assert.equal(mirrorId("a@example.com", "e1", "b@example.com"), "bee6b3ce0502f1477e9b76d8dbffffe5792d6f2f6b53ae688c7f4ee24b8b1eb06");
});

test("変更と削除を反映", async () => {
  await sync();
  a.items[0].end = { dateTime: "2026-10-02T12:00:00+09:00" };
  await sync();
  assert.equal(b.writes.length, 2);
  a.items = [];
  await sync();
  assert.deepEqual(b.deletes, [mirrorId(a.id, "e1", b.id)]);
  assert.deepEqual(Object.keys(state.mirrors), ['["b@example.com","e2","a@example.com"]']);
});

test("期間より前に終わった予定は同期予定を残し、記録だけ消す", async () => {
  await sync();
  now = new Date(Date.UTC(2026, 9, 4));
  a.items = [];
  b.items = [];
  await sync();
  assert.deepEqual(a.deletes, []);
  assert.deepEqual(b.deletes, []);
  assert.deepEqual(state.mirrors, {});
});

test("終わった終日予定も同期予定を残す", async () => {
  a.items = [event("all-day", { start: { date: "2026-10-02" }, end: { date: "2026-10-03" } })];
  b.items = [];
  await sync();
  now = new Date(Date.UTC(2026, 9, 3, 12));
  a.items = [];
  await sync();
  assert.deepEqual(b.deletes, []);
});

test("同期予定・予定なし・辞退・同じ招待は除外", async () => {
  a.items.push(
    event("mirror", { extendedProperties: { private: { [MARKER]: "x:y" } } }),
    event("free", { transparency: "transparent" }),
    event("declined", { attendees: [{ self: true, responseStatus: "declined" }] }),
    event("shared", { iCalUID: "same@example.com" }),
  );
  b.items.push(event("other-copy", { iCalUID: "same@example.com" }));
  await sync();
  assert.equal(b.writes.length, 1);
  assert.equal(a.writes.length, 1);
});

test("終日予定は date のまま同期", async () => {
  a.items = [event("all-day", { start: { date: "2026-10-02" }, end: { date: "2026-10-03" } })];
  await sync();
  assert.deepEqual(b.writes[0][1].start, { date: "2026-10-02" });
});

test("マスターには中身付き、他は予定ありのまま", async () => {
  Object.assign(a.items[0], { location: "Office", hangoutLink: "https://meet.google.com/x", attendees: [{ email: "guest@example.com" }] });
  const c = new FakeCalendar("c@example.com", [event("e3", { summary: "Secret C" })]);
  state.master = b.id;
  assert.equal((await sync([a, b, c])).mirrors, 6);
  const details = b.written(mirrorId(a.id, "e1", b.id));
  assert.equal(details.summary, "Secret A");
  assert.equal(details.location, "Office");
  assert.equal(details.visibility, "default");
  assert.equal(details.description, "Private\n\nGoogle Meet: https://meet.google.com/x\n\n元のカレンダー: a@example.com");
  assert.equal("attendees" in details, false);
  assert.equal(b.written(mirrorId(c.id, "e3", b.id)).summary, "Secret C");
  for (const cal of [a, c]) {
    for (const [, body] of cal.writes) {
      assert.equal(body.summary, "予定あり");
      assert.equal(body.visibility, "private");
      assert.equal(body.description, undefined);
    }
  }
});

test("非公開指定のアカウントはマスターでも非公開", async () => {
  const c = new FakeCalendar("c@example.com", [event("e3", { summary: "Family" })]);
  state.master = b.id;
  await sync([a, b, c], { privateSources: new Set([c.id]) });
  const family = b.written(mirrorId(c.id, "e3", b.id));
  assert.equal(family.summary, "Family");
  assert.equal(family.visibility, "private");
  assert.equal(b.written(mirrorId(a.id, "e1", b.id)).visibility, "default");
});

test("予定なしはマスターにだけ予定なしのまま届く", async () => {
  a.items.push(event("free", { summary: "Lunch", transparency: "transparent" }));
  const c = new FakeCalendar("c@example.com", []);
  state.master = b.id;
  await sync([a, b, c]);
  const free = b.written(mirrorId(a.id, "free", b.id));
  assert.equal(free.transparency, "transparent");
  assert.equal(free.summary, "Lunch");
  assert.equal(c.written(mirrorId(a.id, "free", c.id)), undefined);
});

test("マスターの空き時間は打ち合わせ可能枠になる", async () => {
  b.items.push(event("slot", { summary: "Focus", transparency: "transparent" }));
  state.master = b.id;
  await sync();
  const slot = a.written(mirrorId(b.id, "slot", a.id));
  assert.equal(slot.summary, "予定あり（MTG可能）");
  assert.equal(slot.transparency, "transparent");
  assert.equal(slot.visibility, "private");
  assert.equal(slot.description, undefined);
});

test("終日・勤務場所の予定なしは枠にしない", async () => {
  b.items.push(
    event("holiday", { start: { date: "2026-10-02" }, end: { date: "2026-10-03" }, transparency: "transparent" }),
    event("office", { transparency: "transparent", eventType: "workingLocation" }),
  );
  state.master = b.id;
  await sync();
  assert.equal(a.writes.length, 1);
});

test("マスターを変えると既存の同期予定も書き換わる", async () => {
  await sync();
  state.master = a.id;
  await sync();
  assert.equal(a.writes.length, 2);
  assert.equal(a.writes[1][1].summary, "Secret B");
  assert.equal(b.writes.length, 1);
});

// ここから calendar-busy-sync からの改善点

test("読めないアカウントがあっても、その分の同期予定を消さない", async () => {
  const c = new FakeCalendar("c@example.com", [event("e3")]);
  await sync([a, b, c]);
  const before = { ...state.mirrors };
  c.failList = true;
  const result = await sync([a, b, c]);
  assert.deepEqual([a.deletes, b.deletes, c.deletes], [[], [], []]);
  assert.deepEqual(state.mirrors, before);
  assert.deepEqual(result.errors.map((e) => e.calendarId), [c.id]);
});

test("トークンが切れたアカウント（unavailable）の分も持ち越す", async () => {
  const c = new FakeCalendar("c@example.com", [event("e3")]);
  await sync([a, b, c]);
  const before = { ...state.mirrors };
  await sync([a, b], { unavailable: [c.id] });
  assert.deepEqual(a.deletes, []);
  assert.deepEqual(state.mirrors, before);
});

test("書き込みに失敗した分は次回やり直す", async () => {
  b.failWrite = true;
  const first = await sync();
  assert.equal(first.errors.length, 1);
  assert.equal(Object.keys(state.mirrors).length, 1);
  b.failWrite = false;
  await sync();
  assert.equal(b.writes.length, 1);
  assert.equal(Object.keys(state.mirrors).length, 2);
});

test("時間切れの書き込みは次回に回す", async () => {
  const first = await sync([a, b], { deadline: 0 });
  assert.equal(first.pending, 2);
  assert.equal(a.writes.length + b.writes.length, 0);
  assert.deepEqual(state.mirrors, {});
  const second = await sync();
  assert.equal(second.writes, 2);
});

test("接続解除: そのアカウントの同期予定を消し、残りは次回の同期で消える", async () => {
  const c = new FakeCalendar("c@example.com", []);
  await sync([a, b, c]);
  const { deleted, failed, remaining } = await removeMirrorsIn(b, state.mirrors);
  assert.equal(deleted, 1);
  assert.equal(failed, 0);
  assert.deepEqual(b.deletes, [mirrorId(a.id, "e1", b.id)]);
  assert.equal(Object.keys(remaining).some((k) => JSON.parse(k)[2] === b.id), false);
  // b の予定から a・c に作った同期予定は、b を外した次の同期で消える
  state.mirrors = remaining;
  await sync([a, c]);
  assert.deepEqual(a.deletes, [mirrorId(b.id, "e2", a.id)]);
  assert.deepEqual(c.deletes, [mirrorId(b.id, "e2", c.id)]);
  assert.equal(Object.keys(state.mirrors).some((k) => k.includes(b.id)), false);
});

test("前回の記録がない書き込みは新規として送り、変更は更新として送る", async () => {
  await sync();
  a.items[0].summary = "changed";
  b.items[0].end = { dateTime: "2026-10-02T12:00:00+09:00" };
  await sync();
  assert.deepEqual(b.newFlags, [true]); // a の予定のタイトル変更は「予定あり」の本文を変えない
  assert.deepEqual(a.newFlags, [true, false]);
});

test("並行して書き込んでも結果は同じ", async () => {
  const cals = Array.from({ length: 5 }, (_, i) => new FakeCalendar(`c${i}@example.com`, [event(`e${i}`), event(`f${i}`)]));
  const result = await reconcile(cals, state, { now, concurrency: 8 });
  assert.equal(result.writes, 5 * 2 * 4);
  assert.equal(Object.keys(state.mirrors).length, 40);
  for (const cal of cals) assert.equal(cal.writes.length, 8);
});

test("アカウントが 2 つ未満なら同期しない", async () => {
  await assert.rejects(sync([a]), /At least two accounts/);
});
