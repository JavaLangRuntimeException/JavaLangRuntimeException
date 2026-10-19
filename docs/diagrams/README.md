# README 用の構成図

HTML + 共通 CSS（`_shared.css`）で描き、Playwright で PNG に書き出します。

```bash
node docs/diagrams/render.mjs
```

（`frontend/node_modules` の Playwright を使います。未インストールなら `cd frontend && npm ci`。）

出力は `docs/images/*.png`。名前を渡すとその図だけ書き出します（`node docs/diagrams/render.mjs tech`）。

矢印は各 HTML の `window.LINKS` に「どの箱からどの箱へ」を書き、`_arrows.js` が箱の位置を測って SVG で引きます（gRPC などのロゴも線の上に置けます）。

アイコンは `icons/` に置きます（Redis は [Icons8](https://img.icons8.com/color/1200/redis.jpg)、gRPC と Kubernetes のリソースは CNCF / kubernetes/community の公式、Vite などは simple-icons、Connect は connectrpc の GitHub のアイコン）。
