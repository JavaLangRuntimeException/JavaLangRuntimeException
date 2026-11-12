// サービスの一覧。上の「サービス」メニュー・左のナビ・ホームのカード・パンくずが、ここを見る。
// 画面を足すときはここと app/router.tsx に足す

export type ServiceId = "home" | "functions" | "apis" | "cdn" | "storage" | "databases" | "secrets" | "capacity" | "metrics" | "guide";

export type Service = {
  id: ServiceId;
  to: string;
  label: string;
  /** 1 行の説明（メニューとホームのカードに出す） */
  description: string;
};

export type ServiceGroup = { label: string; services: Service[] };

export const home: Service = { id: "home", to: "/", label: "Console Home", description: "環境と部品の状態" };

// 分類は AWS のコンソールと同じ並び（Compute → Networking → Storage → Database → Security → Management → Help）。名前は英語（AWS と同じ）、説明は日本語
export const serviceGroups: ServiceGroup[] = [
  {
    label: "Compute",
    services: [{ id: "functions", to: "/functions", label: "Functions", description: "コンテナを、リクエストが来たときだけ動かす" }],
  },
  {
    label: "Networking & Content Delivery",
    services: [
      { id: "apis", to: "/apis", label: "API Gateway", description: "ホスト名とパスを関数に結びつける" },
      { id: "cdn", to: "/cdn", label: "CDN", description: "バケットや関数を公開し、キャッシュさせる" },
    ],
  },
  {
    label: "Storage",
    services: [{ id: "storage", to: "/storage", label: "Storage", description: "ファイルを置くバケット" }],
  },
  {
    label: "Database",
    services: [{ id: "databases", to: "/databases", label: "Databases", description: "PostgreSQL と Redis を切り出す" }],
  },
  {
    label: "Security, Identity & Compliance",
    services: [{ id: "secrets", to: "/secrets", label: "Secrets Manager", description: "パスワードやトークンを暗号化して関数に渡す" }],
  },
  {
    label: "Management",
    services: [
      { id: "capacity", to: "/capacity", label: "Capacity", description: "あとどれだけ置けるか" },
      { id: "metrics", to: "/metrics", label: "Metrics", description: "リクエスト・エラー・CPU・メモリ" },
    ],
  },
  {
    label: "Help",
    services: [{ id: "guide", to: "/guide", label: "Guide", description: "しくみの説明と、手を動かすチュートリアル" }],
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
