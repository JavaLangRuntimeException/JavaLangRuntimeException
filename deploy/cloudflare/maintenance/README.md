# taramanji-maintenance（落ちているときにメンテナンス画面を出す）

Cloudflare Workers で taramanji.com の前に立つ Worker。

- ふだんはリクエストをそのままオリジン（Cloudflare Tunnel → 自宅の kind）に通す。中身には触らない
- オリジンが **502 / 503 / 504 / 520〜527 / 530**（Tunnel が切れている 1033 など）を返したとき、または届かないときだけ、
  Cloudflare のエラー画面の代わりに「ただいまメンテナンス中です」の画面を 503（`Retry-After: 60`・`no-store`）で返す
  - アプリの 500 や 4xx は差し替えない
  - 差し替えるのは人がページを開いたとき（`Sec-Fetch-Mode: navigate`、無ければ `Accept: text/html`）だけ。API・画像・POST は元の応答のまま
- 画面は frontend と同じ見た目（暗い面・IBM Plex・背景に流れる CLI コマンド・記号から定まる見出し）。30 秒ごとに同じ URL を見に行き、戻っていたら自動で読み込み直す
- Worker がこけたときは `passThroughOnException()` で素通しにする（サイトを止めない）
- 対象は本番の `taramanji.com/*`・`www.taramanji.com/*`・`gws.taramanji.com/*`（`wrangler.toml` の `routes`）

## 入れ方・変えるとき

API トークンの権限: Account › Workers Scripts › Edit、Zone（taramanji.com）› Workers Routes › Edit、Account › Account Settings › Read

```sh
cd deploy/cloudflare/maintenance
export CLOUDFLARE_API_TOKEN="$(cat ~/Downloads/cf-workers-token.txt)"
npm ci
npm test
npx wrangler deploy
```

- 画面の見た目を確かめる: `node -e 'import("./src/page.js").then(m=>process.stdout.write(m.MAINTENANCE_HTML))' > /tmp/maintenance.html` を作ってブラウザで開く
- 本番で出ているかは応答ヘッダー `X-Taramanji-Maintenance: 1` と `X-Origin-Status`（元の状態）で分かる
- 止めるとき（素通しも含めて外す）: `npx wrangler delete`、またはダッシュボードの Workers Routes から外す

## 注意

- 全リクエストで Worker が動く。無料枠は 1 日 10 万リクエスト（超えたときはルートの設定が fail open なら Worker を飛ばして素通し＝従来どおりの動き）
- 落ちたことの通知は `deploy/cloudflare/uptime` の仕事。ここは見せ方だけ
