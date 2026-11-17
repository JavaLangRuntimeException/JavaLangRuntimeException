import type { ReactNode } from "react";
import type { ServiceId } from "@/lib/nav";

// サービスのアイコン。色の付いた角丸の四角に、白い線画を 1 つ置く（分類ごとに色を決める）。
// 線は全部同じ太さ・同じ端の形にして、手で引いた図面のようにそろえる。グラデーションや飾りは使わない。
// 色は分類を示すだけで、状態は示さない（ライト / ダークで同じ色を使う）

type Glyph = { color: string; paths: ReactNode };

const orange = "#d45b07"; // コンピューティング
const purple = "#7b3fe4"; // ネットワーキング
const green = "#3f8624"; // ストレージ
const blue = "#2e5fd0"; // データベース
const red = "#c7262c"; // セキュリティ
const pink = "#c7305f"; // 管理
const navy = "#232f3e";

const glyphs: Record<ServiceId, Glyph> = {
  // ホーム: 家
  home: { color: navy, paths: <path d="M5 11.5 12 5l7 6.5M7 10v8.5h10V10M10.5 18.5V14h3v4.5" /> },
  // 関数: 入力 → 処理（箱）→ 出力。来たときだけ動く「1 つの処理」
  functions: {
    color: orange,
    paths: (
      <>
        <rect x="8.5" y="7" width="7" height="10" />
        <path d="M3.5 12h5M15.5 12h5M18 9.5l2.5 2.5-2.5 2.5M11 10l2 2-2 2" />
      </>
    ),
  },
  // API Gateway: 門（2 本の柱）を、矢印が通り抜ける
  apis: {
    color: purple,
    paths: <path d="M8 5v14M16 5v14M5.5 5h5M13.5 5h5M5.5 19h5M13.5 19h5M3 12h18M18.5 9.5 21 12l-2.5 2.5" />,
  },
  // CDN: 地球（中心）から、端の点に配る
  cdn: {
    color: purple,
    paths: (
      <>
        <circle cx="12" cy="12" r="5" />
        <path d="M7 12h10M12 7c-2.4 2.8-2.4 7.2 0 10M12 7c2.4 2.8 2.4 7.2 0 10M12 3.5V7M12 17v3.5M3.5 12H7M17 12h3.5" />
      </>
    ),
  },
  // ストレージ: バケツ
  storage: {
    color: green,
    paths: (
      <>
        <ellipse cx="12" cy="7" rx="7" ry="2.5" />
        <path d="M5 7l1.8 11c.2 1.2 2.5 2 5.2 2s5-.8 5.2-2L19 7M5.7 11.5c1.3 1 3.6 1.5 6.3 1.5s5-.5 6.3-1.5" />
      </>
    ),
  },
  // データベース: 円筒（3 段）
  databases: {
    color: blue,
    paths: (
      <>
        <ellipse cx="12" cy="6.5" rx="6.5" ry="2.5" />
        <path d="M5.5 6.5v11c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-11M5.5 12c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5" />
      </>
    ),
  },
  // シークレット: 錠前（鍵穴つき）
  secrets: {
    color: red,
    paths: (
      <>
        <rect x="6" y="10.5" width="12" height="9" />
        <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5M12 14v2.5" />
      </>
    ),
  },
  // 容量: 目盛りの付いた器（どこまで入っているか）
  capacity: {
    color: pink,
    paths: <path d="M6 4.5v15h12v-15M6 13h12M9 16.5h6M13.5 7H18M13.5 10H18" />,
  },
  // ガイド: 開いた本
  guide: {
    color: navy,
    paths: <path d="M12 7c-1.8-1.3-4.3-2-7-2v12c2.7 0 5.2.7 7 2M12 7c1.8-1.3 4.3-2 7-2v12c-2.7 0-5.2.7-7 2M12 7v12" />,
  },
  // メトリクス: 軸と折れ線
  metrics: {
    color: pink,
    paths: <path d="M4.5 4.5v15h15M7.5 15l3.5-4 3 2.5 4.5-6" />,
  },
};

export function ServiceIcon({ id, size = 24 }: { id: ServiceId; size?: number }) {
  const g = glyphs[id];
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} className="shrink-0">
      <rect width="24" height="24" rx="3" fill={g.color} />
      <g fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="square" strokeLinejoin="miter">
        {g.paths}
      </g>
    </svg>
  );
}
