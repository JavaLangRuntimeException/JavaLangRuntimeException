import { reservationApi } from "@/shared/api/clients";
import type { BusyInterval } from "@/shared/lib/busy";

/** 週（月曜 0:00 の ISO）の埋まっている時間。取得に失敗したら空（旧実装と同じ） */
export async function fetchBusy(weekStartIso: string, opts: { noBuffer?: boolean } = {}): Promise<BusyInterval[]> {
  try {
    const res = await reservationApi.getBusy({ weekStartIso, noBuffer: opts.noBuffer ?? false });
    return res.busy.map((b) => ({ start: b.start, end: b.end }));
  } catch {
    return [];
  }
}
