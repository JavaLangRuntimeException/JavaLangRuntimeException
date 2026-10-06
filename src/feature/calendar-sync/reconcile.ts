/**
 * 複数の Google アカウントのメインカレンダーを「予定あり」で相互に同期する。
 * calendar-busy-sync（busy_sync.py）の reconcile の移植。予定 ID・識別マーカーの作り方は同じなので、
 * 元の CLI が作った同期予定をそのまま引き継げる。
 * node --test で直接テストできるよう、型以外は node: の標準モジュールしか import しない。
 */
import { createHash } from "node:crypto";

export const MARKER = "busy_sync_origin";

export type EventTime = { dateTime?: string; date?: string; timeZone?: string };
export type CalendarEvent = {
  id: string;
  status?: string;
  transparency?: string;
  eventType?: string;
  start?: EventTime;
  end?: EventTime;
  summary?: string;
  description?: string;
  location?: string;
  hangoutLink?: string;
  iCalUID?: string;
  attendees?: { self?: boolean; responseStatus?: string; email?: string }[];
  extendedProperties?: { private?: Record<string, string> };
};
export type MirrorBody = {
  summary: string;
  start: EventTime;
  end: EventTime;
  transparency: "opaque" | "transparent";
  visibility: "private" | "default";
  reminders: { useDefault: false; overrides: [] };
  extendedProperties: { private: Record<string, string> };
  description?: string;
  location?: string;
};

export interface SyncCalendar {
  id: string;
  events(start: string, end: string): Promise<CalendarEvent[]>;
  /** isNew: 前回の記録がない（まだ作っていないはず）。true なら作成を先に試す */
  upsert(eventId: string, body: MirrorBody, isNew?: boolean): Promise<void>;
  delete(eventId: string): Promise<void>;
}

/** キーは JSON の [元カレンダー, 元予定 ID, 同期先]、値は [本文のダイジェスト, 元予定の終了時刻] */
export type Mirrors = Record<string, [string, string]>;

export type SyncResult = {
  sourceEvents: number;
  mirrors: number;
  writes: number;
  deletes: number;
  /** 時間切れで次回に回した書き込み */
  pending: number;
  errors: { calendarId: string; error: string }[];
};

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/** キーを並べ替えた JSON（本文の変化を検出するため） */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function mirrorId(sourceId: string, eventId: string, targetId: string): string {
  return "b" + sha256(JSON.stringify([sourceId, eventId, targetId]));
}

function isFreeSlot(event: CalendarEvent): boolean {
  // 終日予定や勤務場所は既定で「予定なし」。時間指定の「予定なし」だけを空き枠として扱う
  return event.transparency === "transparent" && !!event.start?.dateTime && (event.eventType ?? "default") === "default";
}

export function sourceEvents(events: CalendarEvent[]): Record<string, CalendarEvent> {
  const result: Record<string, CalendarEvent> = {};
  for (const event of events) {
    if (
      (event.status === "confirmed" || event.status === "tentative")
      && ((event.transparency ?? "opaque") === "opaque" || isFreeSlot(event))
      && event.start && event.end
      && !event.extendedProperties?.private?.[MARKER]
      && !(event.attendees ?? []).some((a) => a.self && a.responseStatus === "declined")
    ) {
      result[event.id] = event;
    }
  }
  return result;
}

export function mirrorBody(sourceId: string, event: CalendarEvent, detailed = false, isPrivate = false): MirrorBody {
  const body: MirrorBody = {
    summary: "予定あり", start: event.start!, end: event.end!,
    transparency: "opaque", visibility: "private",
    reminders: { useDefault: false, overrides: [] },
    extendedProperties: { private: { [MARKER]: `${sourceId}:${event.id}` } },
  };
  if (event.transparency === "transparent") {
    // マスターの空き時間は、他のカレンダーへ打ち合わせ可能な枠として出す
    body.summary = "予定あり（MTG可能）";
    body.transparency = "transparent";
  }
  if (detailed) {
    // 中身だけコピーする。参加者をコピーすると Google が招待メールを送ってしまう
    body.summary = event.summary || "(タイトルなし)";
    body.visibility = isPrivate ? "private" : "default";
    const notes = [event.description ?? "", event.hangoutLink ? `Google Meet: ${event.hangoutLink}` : "", `元のカレンダー: ${sourceId}`];
    body.description = notes.filter(Boolean).join("\n\n");
    if (event.location) body.location = event.location;
  }
  return body;
}

export function eventEnd(event: CalendarEvent): Date {
  const end = event.end!;
  if (end.dateTime) return new Date(end.dateTime);
  // 終日予定の終了日は現地の 0 時。UTC+14 を仮定すると最も早い時刻になる
  return new Date(Date.parse(`${end.date}T00:00:00Z`) - 14 * 3600_000);
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * 全カレンダーを読み終えてから書き込む。途中で失敗・時間切れになっても再実行で収束する。
 * - 予定を読めなかったカレンダー（unavailable を含む）が関わる同期は、作成も削除もせずそのまま持ち越す
 * - deadline（ミリ秒時刻）を過ぎたら新しい書き込みをやめ、次回に回す
 */
export async function reconcile(
  calendars: SyncCalendar[],
  state: { master?: string | null; mirrors?: Mirrors },
  options: {
    now?: Date; days?: number; privateSources?: Set<string>; deadline?: number; unavailable?: string[];
    /** 同時に送る書き込みの数 */
    concurrency?: number;
  } = {},
): Promise<SyncResult> {
  const { days = 90, privateSources = new Set<string>(), deadline = Infinity, concurrency = 6 } = options;
  const down = new Set(options.unavailable ?? []);
  if (calendars.length + down.size < 2) throw new Error("At least two accounts must be connected");
  const now = options.now ?? new Date();
  const windowStart = new Date(now.getTime() - 86400_000);
  const start = windowStart.toISOString();
  const end = new Date(now.getTime() + days * 86400_000).toISOString();
  const errors: SyncResult["errors"] = [];

  const originals = new Map<string, Record<string, CalendarEvent>>();
  for (const cal of calendars) {
    try {
      originals.set(cal.id, sourceEvents(await cal.events(start, end)));
    } catch (err) {
      down.add(cal.id);
      errors.push({ calendarId: cal.id, error: message(err) });
    }
  }
  const live = calendars.filter((c) => !down.has(c.id));
  const byId = new Map(calendars.map((c) => [c.id, c]));
  const previous = state.mirrors ?? {};
  const desired: Mirrors = {};
  const master = state.master ?? null;
  let writes = 0;
  let pending = 0;
  let deletes = 0;
  const tasks: { key: string; digest: string; endAt: string; target: SyncCalendar; id: string; body: MirrorBody }[] = [];

  for (const source of live) {
    for (const event of Object.values(originals.get(source.id)!)) {
      const endAt = eventEnd(event).toISOString();
      for (const target of live) {
        if (source.id === target.id) continue;
        if (event.transparency === "transparent" && master !== source.id && master !== target.id) {
          continue; // 空き枠はマスターとの間でだけ同期する
        }
        const uid = event.iCalUID;
        if (uid && Object.values(originals.get(target.id)!).some((other) => other.iCalUID === uid)) {
          continue; // 同じ招待が同期先にもある
        }
        const body = mirrorBody(source.id, event, target.id === master, privateSources.has(source.id));
        const digest = sha256(stableStringify(body));
        const key = JSON.stringify([source.id, event.id, target.id]);
        if (previous[key]?.[0] === digest) {
          desired[key] = [digest, endAt];
          continue;
        }
        tasks.push({ key, digest, endAt, target, id: mirrorId(source.id, event.id, target.id), body });
      }
    }
  }

  // 書き込みは並行して送る。時間切れや失敗した分は前回の記録のまま残し、次回やり直す
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const task = tasks[next++];
      const before = previous[task.key];
      if (Date.now() > deadline) {
        pending++;
        if (before) desired[task.key] = before;
        continue;
      }
      try {
        await task.target.upsert(task.id, task.body, !before);
        writes++;
        desired[task.key] = [task.digest, task.endAt];
      } catch (err) {
        errors.push({ calendarId: task.target.id, error: message(err) });
        if (before) desired[task.key] = before;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, tasks.length)) }, worker));

  for (const [key, value] of Object.entries(previous)) {
    if (key in desired) continue;
    const [sourceId, eventId, targetId] = JSON.parse(key) as [string, string, string];
    if (down.has(sourceId) || down.has(targetId)) {
      desired[key] = value; // 読めなかったカレンダーの分は判断できないので触らない
      continue;
    }
    if (new Date(value[1]) <= windowStart) continue; // 期間より前に終わった予定は、同期予定を残して記録だけ消す
    const target = byId.get(targetId);
    if (!target) continue; // 接続を解除したアカウント
    try {
      await target.delete(mirrorId(sourceId, eventId, targetId));
      deletes++;
    } catch (err) {
      errors.push({ calendarId: targetId, error: message(err) });
      desired[key] = value;
    }
  }

  state.mirrors = desired;
  const sourceCount = [...originals.values()].reduce((n, events) => n + Object.keys(events).length, 0);
  return { sourceEvents: sourceCount, mirrors: Object.keys(desired).length, writes, deletes, pending, errors };
}

/**
 * 接続を解除するアカウントのカレンダーから、このアプリが作った同期予定を消す。
 * 消せなかった分（トークン失効など）も含め、そのアカウント宛ての記録は remaining から外す。
 * そのアカウントの予定から作った他カレンダーの同期予定は、次回の同期で消える。
 */
export async function removeMirrorsIn(target: SyncCalendar, mirrors: Mirrors): Promise<{ deleted: number; failed: number; remaining: Mirrors }> {
  const remaining: Mirrors = {};
  let deleted = 0;
  let failed = 0;
  for (const [key, value] of Object.entries(mirrors)) {
    const [sourceId, eventId, targetId] = JSON.parse(key) as [string, string, string];
    if (targetId !== target.id) {
      remaining[key] = value;
      continue;
    }
    try {
      await target.delete(mirrorId(sourceId, eventId, targetId));
      deleted++;
    } catch {
      failed++;
    }
  }
  return { deleted, failed, remaining };
}
