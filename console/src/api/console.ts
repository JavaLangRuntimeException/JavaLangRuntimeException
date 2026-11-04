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

/** 容量（この環境の枠・Mac mini 全体・あと置けるアプリ）。全環境で使える。デプロイの前に見るので短めの間隔で読み直す */
export function useCapacity() {
  return useQuery({
    queryKey: ["console", "capacity"],
    queryFn: ({ signal }) => consoleApi.getCapacity({}, { signal }),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
