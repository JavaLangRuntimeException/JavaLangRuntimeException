import { useQuery } from "@tanstack/react-query";
import { contentApi } from "@/shared/api/clients";
import { CONNPASS_NICKNAME, type ConnpassEvent } from "../model/event";

/** 主催イベント（開始日時の古い順） */
export function useConnpassEvents() {
  return useQuery({
    queryKey: ["connpass-events", CONNPASS_NICKNAME],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ConnpassEvent[]> => {
      const res = await contentApi.listConnpassEvents({ nickname: CONNPASS_NICKNAME });
      return [...res.events]
        .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
        .map((e) => ({ ...e }));
    },
  });
}
