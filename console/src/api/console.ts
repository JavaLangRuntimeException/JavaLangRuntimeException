import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

/** 関数と API で選べるもの（インスタンスタイプ・用意した監視・通知先）。ほぼ変わらないので長く持つ */
export function useHostingOptions() {
  return useQuery({
    queryKey: ["console", "hosting", "options"],
    queryFn: ({ signal }) => consoleApi.getHostingOptions({}, { signal }),
    staleTime: 5 * 60_000,
  });
}

const functionsKey = ["console", "functions"] as const;
const apisKey = ["console", "apis"] as const;

/** 関数の一覧（リポジトリの YAML + クラスターでの状態）。反映待ち・起動中が変わるのを見るので短めに読み直す */
export function useFunctions(enabled: boolean) {
  return useQuery({
    queryKey: functionsKey,
    queryFn: ({ signal }) => consoleApi.listFunctions({}, { signal }),
    enabled,
    staleTime: 10_000,
    refetchInterval: 20_000,
  });
}

/** API の一覧（ホスト名とルート） */
export function useApis(enabled: boolean) {
  return useQuery({
    queryKey: apisKey,
    queryFn: ({ signal }) => consoleApi.listApis({}, { signal }),
    enabled,
    staleTime: 30_000,
  });
}

/** 保存・削除・監視の同期。終わったら一覧と容量を読み直す（API を変えると、関数の「渡している API」も変わる） */
export function useComputeMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: functionsKey });
    void qc.invalidateQueries({ queryKey: apisKey });
    void qc.invalidateQueries({ queryKey: ["console", "capacity"] });
  };
  return {
    applyFunction: useMutation({ mutationFn: (req: Parameters<typeof consoleApi.applyFunction>[0]) => consoleApi.applyFunction(req), onSuccess: refresh }),
    deleteFunction: useMutation({ mutationFn: (req: Parameters<typeof consoleApi.deleteFunction>[0]) => consoleApi.deleteFunction(req), onSuccess: refresh }),
    applyApi: useMutation({ mutationFn: (req: Parameters<typeof consoleApi.applyApi>[0]) => consoleApi.applyApi(req), onSuccess: refresh }),
    deleteApi: useMutation({ mutationFn: (req: Parameters<typeof consoleApi.deleteApi>[0]) => consoleApi.deleteApi(req), onSuccess: refresh }),
    syncAlerts: useMutation({ mutationFn: () => consoleApi.syncAlerts({}) }),
  };
}
