/** connpass で主催したイベント（旧 /api/connpass と同じ項目） */
export interface ConnpassEvent {
  eventId: bigint;
  title: string;
  catch: string;
  eventUrl: string;
  startedAt: string;
  endedAt: string;
  limit: number;
  accepted: number;
  waiting: number;
  place: string;
  address: string;
  imageUrl: string;
}

/** 主催イベントを取得する connpass のユーザー（旧 API の既定値と同じ） */
export const CONNPASS_NICKNAME = "tarakokko3233";
