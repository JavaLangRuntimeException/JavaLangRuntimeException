import { useQuery } from "@tanstack/react-query";
import { ConsoleService } from "./gen/taramanji/cloud/v1/console_pb";
import { client } from "./transport";

export const consoleApi = client(ConsoleService);

export type MetricsRange = "1h" | "1d" | "7d";

/** 概要（環境・ログイン中の人・部品の状態）。ヘッダーと各画面で共有する */
export function useOverview() {
  return useQuery({
    queryKey: ["console", "overview"],
    queryFn: ({ signal }) => consoleApi.getOverview({}, { signal }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/** メトリクス。metricsEnabled が false の環境では呼ばない（呼ぶと failed_precondition） */
export function useMetrics(range: MetricsRange, enabled: boolean) {
  return useQuery({
    queryKey: ["console", "metrics", range],
    queryFn: ({ signal }) => consoleApi.getMetrics({ range }, { signal }),
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
  });
}
