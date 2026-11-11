// サービスの一覧。上の「サービス」メニュー・左のナビ・ホームのカード・パンくずが、ここを見る。
// 画面を足すときはここと app/router.tsx に足す

export type ServiceId = "home" | "functions" | "apis" | "cdn" | "storage" | "databases" | "capacity" | "metrics" | "guide";

export type Service = {
  id: ServiceId;
  to: string;
  label: string;
  /** 1 行の説明（メニューとホームのカードに出す） */
  description: string;
};

export type ServiceGroup = { label: string; services: Service[] };

export const home: Service = { id: "home", to: "/", label: "コンソールのホーム", description: "環境と部品の状態" };

// 分類は AWS のコンソールと同じ並び（コンピューティング → ネットワーキング → ストレージ → データベース → 管理 → ヘルプ）
export const serviceGroups: ServiceGroup[] = [
  {
    label: "コンピューティング",
    services: [{ id: "functions", to: "/functions", label: "関数", description: "コンテナを、リクエストが来たときだけ動かす" }],
  },
  {
    label: "ネットワーキングとコンテンツ配信",
    services: [
      { id: "apis", to: "/apis", label: "API Gateway", description: "ホスト名とパスを関数に結びつける" },
      { id: "cdn", to: "/cdn", label: "CDN", description: "バケットや関数を公開し、キャッシュさせる" },
    ],
  },
  {
    label: "ストレージ",
    services: [{ id: "storage", to: "/storage", label: "ストレージ", description: "ファイルを置くバケット" }],
  },
  {
    label: "データベース",
    services: [{ id: "databases", to: "/databases", label: "データベース", description: "PostgreSQL と Redis を切り出す" }],
  },
  {
    label: "管理",
    services: [
      { id: "capacity", to: "/capacity", label: "容量", description: "あとどれだけ置けるか" },
      { id: "metrics", to: "/metrics", label: "メトリクス", description: "リクエスト・エラー・CPU・メモリ" },
    ],
  },
  {
    label: "ヘルプ",
    services: [{ id: "guide", to: "/guide", label: "ガイド", description: "しくみの説明と、手を動かすチュートリアル" }],
  },
];

export const services: Service[] = serviceGroups.flatMap((g) => g.services);

/** 今のパスのサービス（パンくず用）。ホームと、どれにも当たらないパスは undefined */
export function serviceOf(pathname: string): Service | undefined {
  return services.find((s) => pathname === s.to || pathname.startsWith(`${s.to}/`));
}

/** メニューの絞り込み。名前か説明に、入れた文字（大文字小文字は区別しない）を含むもの */
export function filterGroups(query: string): ServiceGroup[] {
  const q = query.trim().toLowerCase();
  if (q === "") return serviceGroups;
  return serviceGroups
    .map((g) => ({ ...g, services: g.services.filter((s) => `${s.label} ${s.description} ${s.id}`.toLowerCase().includes(q)) }))
    .filter((g) => g.services.length > 0);
}
