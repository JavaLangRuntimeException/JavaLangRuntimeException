import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ConsoleService } from "./gen/taramanji/cloud/v1/console_pb";
import { client } from "./transport";
import { uploadAll, type UploadItem } from "@/lib/upload";

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

const bucketsKey = ["console", "buckets"] as const;
const cdnKey = ["console", "cdn"] as const;
const objectsKey = (bucket: string, prefix: string) => ["console", "objects", bucket, prefix] as const;

/** バケットの一覧（リポジトリの YAML + ストレージでの使用量）。反映待ちが変わるのを見るので短めに読み直す */
export function useBuckets(enabled: boolean) {
  return useQuery({
    queryKey: bucketsKey,
    queryFn: ({ signal }) => consoleApi.listBuckets({}, { signal }),
    enabled,
    staleTime: 10_000,
    refetchInterval: 20_000,
  });
}

export function useObjects(bucket: string, prefix: string) {
  return useQuery({
    queryKey: objectsKey(bucket, prefix),
    queryFn: ({ signal }) => consoleApi.listObjects({ bucket, prefix }, { signal }),
    placeholderData: (prev) => prev,
  });
}

/** CDN の一覧（ホスト名と元） */
export function useDistributions(enabled: boolean) {
  return useQuery({
    queryKey: cdnKey,
    queryFn: ({ signal }) => consoleApi.listDistributions({}, { signal }),
    enabled,
    staleTime: 30_000,
  });
}

const databasesKey = ["console", "databases"] as const;

/** データベースの一覧（リポジトリの YAML + コントローラーが書いた状態）。作成中が使用可能に変わるのを見るので短めに読み直す */
export function useDatabases(enabled: boolean) {
  return useQuery({
    queryKey: databasesKey,
    queryFn: ({ signal }) => consoleApi.listDatabases({}, { signal }),
    enabled,
    staleTime: 10_000,
    refetchInterval: 20_000,
  });
}

export function useDatabaseMutations() {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: databasesKey });
  return {
    create: useMutation({ mutationFn: (req: { name: string; engine: string }) => consoleApi.createDatabase(req), onSuccess: refresh }),
    remove: useMutation({ mutationFn: (req: { name: string; revision: string }) => consoleApi.deleteDatabase(req), onSuccess: refresh }),
  };
}

/** デプロイの様子（コントローラーがリポジトリの YAML を入れた結果と履歴）。保存のあと 15 秒ほどで変わるので短めに読み直す */
export function useDeployments() {
  return useQuery({
    queryKey: ["console", "deployments"],
    queryFn: ({ signal }) => consoleApi.listDeployments({}, { signal }),
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}

/** オブジェクトを置く。Connect ではなく HTTP の PUT（同じオリジンなので Access の Cookie が付く） */
export async function uploadObject(bucket: string, key: string, file: File): Promise<void> {
  const res = await fetch(objectUrl(bucket, key), { method: "PUT", body: file, headers: { "Content-Type": "application/octet-stream" } });
  if (!res.ok) throw new Error(res.status === 413 ? "ファイルが大きすぎます" : res.status === 400 ? "この名前では置けません" : `アップロードできませんでした（HTTP ${res.status}）`);
}

/** オブジェクトを取り出す URL（ファイルとして保存される） */
export function objectUrl(bucket: string, key: string): string {
  return `/_objects/${encodeURIComponent(bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/** バケット・オブジェクト・CDN の変更。終わったら一覧を読み直す */
export function useStorageMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: bucketsKey });
    void qc.invalidateQueries({ queryKey: cdnKey });
    void qc.invalidateQueries({ queryKey: ["console", "objects"] });
  };
  return {
    createBucket: useMutation({ mutationFn: (req: { name: string; public: boolean }) => consoleApi.createBucket(req), onSuccess: refresh }),
    updateBucket: useMutation({ mutationFn: (req: Parameters<typeof consoleApi.updateBucket>[0]) => consoleApi.updateBucket(req), onSuccess: refresh }),
    deleteBucket: useMutation({ mutationFn: (req: Parameters<typeof consoleApi.deleteBucket>[0]) => consoleApi.deleteBucket(req), onSuccess: refresh }),
    deleteObject: useMutation({ mutationFn: (req: Parameters<typeof consoleApi.deleteObject>[0]) => consoleApi.deleteObject(req), onSuccess: refresh }),
    upload: useMutation({
      // items のパスはバケットの中のキー（planUpload で今いるフォルダーを付けたもの）。少しずつ並べて置く
      mutationFn: ({ bucket, items, onProgress }: { bucket: string; items: UploadItem[]; onProgress: (done: number, total: number) => void }) =>
        uploadAll(items, (it) => uploadObject(bucket, it.path, it.file), onProgress),
      onSettled: refresh,
    }),
    applyDistribution: useMutation({ mutationFn: (req: Parameters<typeof consoleApi.applyDistribution>[0]) => consoleApi.applyDistribution(req), onSuccess: refresh }),
    deleteDistribution: useMutation({ mutationFn: (req: Parameters<typeof consoleApi.deleteDistribution>[0]) => consoleApi.deleteDistribution(req), onSuccess: refresh }),
  };
}

/** 保存・削除・監視の同期。終わったら一覧と容量を読み直す（API を変えると、関数の「渡している API」も変わる） */
export function useComputeMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: functionsKey });
    void qc.invalidateQueries({ queryKey: apisKey });
    void qc.invalidateQueries({ queryKey: ["console", "databases"] });
    void qc.invalidateQueries({ queryKey: ["console", "buckets"] });
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
