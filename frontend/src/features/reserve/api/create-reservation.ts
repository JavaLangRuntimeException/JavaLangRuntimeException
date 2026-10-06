import { ConnectError } from "@connectrpc/connect";
import { reservationApi } from "@/shared/api/clients";
import { toApiError } from "@/shared/api/errors";
import type { ContactMethod } from "../model/state";

export type CreatedInfo = {
  ok: boolean;
  eventId?: string;
  htmlLink?: string;
  meetLink?: string;
  error?: string;
  message?: string;
  detail?: string;
} | null;

export type ReservationPayload = {
  year: number;
  month: number;
  day: number;
  weekday: string;
  start: { hour: number; minute: number };
  end: { hour: number; minute: number };
  name: string;
  email: string;
  purpose: string;
  contactMethod: ContactMethod;
  discordName?: string;
  discordServer?: string;
  slackName?: string;
  slackWorkspace?: string;
  otherNote?: string;
  offlinePlaceLink?: string;
  offlinePlaceName?: string;
  offlinePlaceDetail?: string;
  meetingNote?: string;
};

/** 予約を作る。失敗も画面に出す形（旧 API の ok / error / message / detail）で返す */
export async function createReservation(p: ReservationPayload): Promise<NonNullable<CreatedInfo>> {
  try {
    const res = await reservationApi.createReservation({ ...p });
    return { ok: true, eventId: res.eventId || undefined, htmlLink: res.htmlLink || undefined, meetLink: res.meetLink || undefined };
  } catch (err) {
    // サーバーまで届かなかった（エラーコードがない）ときは旧実装と同じ request_failed
    if (!ConnectError.from(err).metadata.get("x-error-code")) {
      return { ok: false, error: "request_failed", message: "予約APIへの接続に失敗しました。", detail: ConnectError.from(err).rawMessage };
    }
    const e = toApiError(err);
    return { ok: false, error: e.code, message: e.message || undefined, detail: e.detail };
  }
}
