# CLAUDE.md（console）

taramanji cloud（家の kind の上で動く自分専用の小さな AWS）のマネジメントコンソール。
React 19 + Vite + TypeScript + React Router v8 + Tailwind CSS v4 + TanStack Query。使うのは管理者 1 人だけ。

- 公開先: https://cloud.taramanji.com（本番）/ cloud-stg.taramanji.com / cloud-dev.taramanji.com
- 前に Cloudflare Access（Google ログイン）がいて、API も Access の JWT を確かめる。`unauthenticated` / `permission_denied` は「ログインの期限切れ」として、読み直し（Access の再ログイン）を案内する
- API は同じオリジンの Connect（`taramanji.cloud.v1.ConsoleService`、proto は `../backend/proto/taramanji/cloud/v1/console.proto`）
- `src/api/gen` は `npm run gen`（buf + protoc-gen-es）が作るファイル。手で直さない。proto を変えたら作り直してコミットする（Docker のビルドは proto を見られないため）
- 外部の CDN・フォント・スクリプトは使わない（nginx の CSP が `'self'` だけ）。グラフはライブラリを使わず SVG で描く（`src/components/LineChart.tsx`）
- 色は `src/app/styles.css` の変数だけで決める。ライト / ダークは OS の設定に従う。グラフの系列色（`--s1`〜`--s8`）は検証済みの並びなので順番を変えない
- 本番以外（stg / dev）はヘッダーの色付きバッジと上端の帯で示す。取り違え防止のため消さない

## 構成

- `src/app` 起動・ルーティング・QueryClient・全体の CSS
- `src/api` Connect のクライアント、クエリのフック、エラーの判定
- `src/components` 画面の部品（AppShell・Panel・LineChart など）
- `src/pages` 画面（概要・容量・メトリクス・ストレージ・ホスティング）
- `src/lib` 表示の整形・軸の計算・ナビの定義（純粋な関数はここに置いてテストする）

## コマンド

```sh
npm run dev        # 開発サーバー。RPC は GATEWAY_URL（既定 http://localhost:8080）へ送る
npm run gen        # proto から src/api/gen を作る
npm run typecheck
npm run lint       # oxlint
npm test           # vitest
npm run build
```
