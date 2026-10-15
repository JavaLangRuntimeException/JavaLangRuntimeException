# README 用の構成図

HTML + 共通 CSS（`_shared.css`）で描き、Playwright で PNG に書き出します。

```bash
node docs/diagrams/render.mjs
```

（`frontend/node_modules` の Playwright を使います。未インストールなら `cd frontend && npm ci`。）

出力は `docs/images/*.png`。アイコンは `icons/` に置きます（Redis は [Icons8](https://img.icons8.com/color/1200/redis.jpg)）。
