# taramanji backend

taramanji.com のバックエンド（Go のマイクロサービス 8 つ）。設計の前提・規約は [CLAUDE.md](CLAUDE.md)。
土台は [manji-standard-server](../../manji-standard-server/README.md) の Go 版スキャフォールド（proto 駆動 DDD / `mss-protoc-gen`）。

```
ブラウザ ─Connect─▶ Envoy Gateway ─▶ identity / inquiry / reservation / worklocation / content / calendarsync / analytics
                                         inquiry ─gRPC─▶ notification
                                     reservation ─gRPC─▶ worklocation
                                     すべて ─▶ Redis（StatefulSet）
```

## セットアップ

```bash
make install-tools   # buf と mss-protoc-gen
make proto-gen       # proto/ → gen/ と internal/<context>/**/*.gen.go
make test
```

## ローカルで 1 サービス動かす

```bash
APP_ENV=local REDIS_URL=redis://localhost:6379/0 make run SERVICE=worklocation
curl -s -XPOST localhost:8080/taramanji.worklocation.v1.WorkLocationService/ListWorkLocations \
  -H 'content-type: application/json' -d '{}'
```

他のサービスの URL は `<NAME>_URL`（例: `NOTIFICATION_URL=http://localhost:8081`）で上書きできる。既定はクラスター内の `http://<name>:8080`。

## 環境変数（共通）

| 変数 | 用途 |
| --- | --- |
| `APP_ENV` | local / dev / staging / prod |
| `PORT` | 待ち受け（既定 `:8080`） |
| `REDIS_URL` | Redis（サービスごとに DB 番号を分ける） |
| `AUTH_SECRET` | セッション JWT の署名鍵（32 文字以上。全サービス共通） |
| `ADMIN_EMAIL` | 管理画面に入れるメールアドレス（カンマ区切り） |
| `DD_AGENT_HOST` | Datadog Agent（APM・DogStatsD） |

サービス固有の変数は各 `cmd/<service>/main.go` を参照（`env.Required` は未設定なら起動しない）。

## イメージ

```bash
make docker-build                                                 # 全サービスを手元でビルド（GHCR への push は CI の build）
docker build --build-arg SERVICE=reservation -t reservation .     # 1 つだけ
```

## 旧実装（Next.js）との同一性

- メール文面・予約の件名と説明文・同期予定の ID は `testdata/golden.json` と照合する
- `golden.json` は旧 TypeScript を Node で実行して作った
- 公開データ（content・reservation の空き時間）は `go test -tags live` で本番の旧 API と比較する
