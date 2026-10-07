# CLAUDE.md

taramanji.com のバックエンド。Go + DDD + クリーンアーキテクチャのマイクロサービス群で、サービス間は gRPC。
`../manji-standard-server` の Go 版スキャフォールドを土台にしている（コード生成・エラー処理・レイヤー規約を引き継ぐ）。
`.claude/skills/` と `.claude/agents/` 配下の skill / subagent は、このファイルを読んでプロジェクト固有の前提を把握する。

## 技術スタック

- **言語**: Go 1.27（go.mod は 1.26）
- **API スタイル**: Connect（connect-go）。1 つのハンドラで **gRPC / gRPC-Web / Connect（JSON over HTTP）** を受ける
  - ブラウザ → Envoy Gateway → 各サービス: Connect（フロントは connect-es）
  - サービス間: gRPC（h2c）。`pkg/util/server.InternalHTTPClient()` + `InternalClientOptions()`（`connect.WithGRPC()`）
  - ブラウザのリダイレクトや sendBeacon を受ける口だけは素の HTTP ハンドラ（OAuth の `/api/auth/*`・`/api/calendar-sync/connect|callback`・`/api/metrics/pageview`）。URL は旧 Next.js と同じで、Google に登録済みのリダイレクト URI を変えない
- **Proto**: Protocol Buffers + buf。`proto/taramanji/<context>/v1/*.proto`
- **コード生成**: `protoc-gen-go` + `protoc-gen-connect-go`（`gen/`）と、独自の `mss-protoc-gen`（`cmd/mss-protoc-gen/`）。buf.gen.yaml の opt:
  - `go_module=github.com/javalangruntimeexception/taramanji/backend`（`module=` は protogen の予約語なので使わない）
  - `contexts=true` — proto package ごとに `internal/<context>/...` へ出し分ける（境界づけられたコンテキスト）
  - `infra=redis` — Repository 実装は Redis（JSON を 1 レコード 1 キー、`<entity>s:rec:<pk>`）
  - `handler=connect` — Connect ハンドラと pb ⇄ usecase 型の変換を生成
- **データストア**: Redis（クラスター内の StatefulSet）。サービスごとに DB 番号を分ける（`pkg/util/redisx`）
- **可観測性**: Datadog。dd-trace-go v2（APM: HTTP サーバー・外部 HTTP・go-redis）、DogStatsD（業務メトリクス）、slog の JSON ログに trace_id を付与（`pkg/util/observability`・`logger`）
- **テスト方針**: ユニットテストは手書きの fake / 生成 Mock。Redis を使う結合テストは miniredis。旧実装との同一性は golden テスト（旧 TS を Node で実行して作った `testdata/golden.json`）と `-tags live` の本番比較テスト
- **ビルド**: make + go。イメージは 1 つの Dockerfile（`--build-arg SERVICE=<name>`、distroless/static・nonroot）

## アーキテクチャ

- **パターン**: DDD + クリーンアーキテクチャ。コンテキストごとに同じ層構成
  ```
  Proto (.proto)
   └→ protoc-gen-go / connect-go: gen/taramanji/<ctx>/v1/**
   └→ mss-protoc-gen（contexts=true なので internal/<ctx>/ 以下）:
      domain/entity/*.gen.go                      (@entity から)
      domain/repository/*_repository.gen.go       (interface) + mock/
      infra/repository/*_redis_repository.gen.go  (Redis 実装)
      dto/*.gen.go
      usecase/*_usecase_interface.gen.go          (Usecase interface + Input / Output 型)
      handler/*_handler.gen.go                    (Connect ハンドラ。pb ⇄ usecase 変換 + errs.ToConnect)
      di/handlers.gen.go                          (Handlers + Register(mux, opts...))

  Handler (生成) → Usecase interface (生成)
                    ↑ 実装
  <Name>UsecaseImpl (手書き) → domain/service (手書き) → domain/repository (生成 interface)
                             → domain/gateway (手書き interface) ← infra/gateway (手書き: 外部 API・他サービスの gRPC クライアント)
  ```
- **gateway**: 外部（Google・GAS・SES・Qiita など）と他サービスは `domain/gateway` に interface を置き、`infra/gateway` で実装する。usecase は interface だけを知る
- **依存方向**: 常に内側へ。Entity と domain/service は infra・handler を import しない
- **DI**: コンストラクタ注入。ワイヤリングは `cmd/<service>/main.go` だけ
- **エラー**（manji-standard-server の PR #8 を移植）: `pkg/util/errs`
  - usecase / domain は `*errs.DomainError` を返す。`WithCode("invalid_email")` の機械可読コードは旧 API のエラー文字列を引き継ぎ、フロントはこれで分岐する
  - 生成ハンドラが `errs.ToConnect` で Connect エラーへ変換: コード対応、メタデータ `x-error-code`、`google.rpc.ErrorInfo`（reason=Code）、フィールドエラーは `google.rpc.BadRequest`
  - `ErrorTypeInternal` は内容を返さない（ログだけ）。外部 API の失敗は `ErrorTypeUpstream`（502 相当、detail はクライアントにも返す）
  - ログは `errs.Report` に集約（4xx 相当は WARN、Internal / Concurrency / Upstream は ERROR）
- **認可**: `pkg/util/auth`。セッションは identity が発行する HS256 JWT の Cookie（`taramanji_session`、AUTH_SECRET 共有）。`auth.AdminInterceptor(adminProcs, cronProcs, cronToken)` を main で付ける
- **時刻**: 日付の判定は日本時間（`pkg/util/jst`）。「いま」は `clock func() time.Time` で注入

## サービス（コンテキスト）

| サービス | 公開 | 担当 |
| --- | --- | --- |
| identity | Connect + HTTP `/api/auth/*` | Google ログイン、セッション |
| notification | **内部 gRPC のみ** | SES でメール送信 |
| inquiry | Connect | お問い合わせ・アンケート・管理者メール → notification |
| reservation | Connect | 予約（GAS ウェブフック / Google Calendar）、空き時間（iCal）、Google マップ → worklocation |
| worklocation | Connect（GetWorkLocation は内部用） | 勤務場所 |
| content | Connect | Qiita・connpass・ORCID・OGP |
| calendarsync | Connect + HTTP `/api/calendar-sync/*` | 複数アカウントのカレンダー同期（RunSync は CronJob） |
| analytics | HTTP `/api/metrics/pageview` | ページビュー → web.pageviews |

## ディレクトリ構造

```
backend/
├── cmd/
│   ├── <service>/main.go       # 各マイクロサービスのエントリポイント（ワイヤリングのみ）
│   └── mss-protoc-gen/         # 独自 protoc プラグイン
├── gen/                        # protoc-gen-go / connect-go の生成物
├── internal/<context>/
│   ├── domain/{entity,repository,service,gateway}/
│   ├── dto/  usecase/  handler/  di/
│   └── infra/{repository,gateway}/
├── pkg/util/                   # 横断ユーティリティ: env logger errs auth server observability httpx redisx jst
├── proto/taramanji/<context>/v1/*.proto
├── buf.yaml / buf.gen.yaml
└── Dockerfile / Makefile
```

## proto アノテーション（mss-protoc-gen が解釈）

- `// @entity` — Entity / Repository interface / Mock / Redis 実装 / DTO を生成
- `// @pk` — 主キー（`SelectByPK` / `Delete` / `BulkDelete`）
- `// @unique` — `SelectBy<Field>`（Redis ではインデックスキー）
- `// @email` / `// @required` — Entity のバリデーション
- `// @timestamp` — `int64` を `time.Time` に
- `// @paging` — cursor pagination
- `// @http METHOD /path` — handler=rest のときだけ使う（このプロジェクトは handler=connect なので不要）
- handler=connect では rpc の入力に @entity・enum を使わない（`*Params` の message にする）。message は同じ proto package 内のものだけ

## コーディング規約

- **命名**: パッケージは小文字。interface にドメイン名を重ねない
- **エラー**: domain / usecase は `errs.New*`。旧 API のエラー文字列はそのまま `WithCode` に
- **コンテキスト**: `context.Context` は第一引数
- **時刻**: `clock func() time.Time` を注入。日付は `jst` で
- **外部 HTTP**: `pkg/util/httpx`（APM 計装済み）を使う。任意 URL を取りに行かない（許可リスト）
- **メトリクス**: `observability.Metrics`（Count / Gauge / Timing）。タグの値は有限の集合に限る
- **コメント**: 日本語で WHY を書く

## よく使うコマンド

- `make install-tools` — buf + mss-protoc-gen
- `make proto-gen` — proto 変更後は必須
- `make build` / `make run SERVICE=reservation`
- `make test` / `make lint` / `make fmt`
- `make docker-build`（手元でビルドするだけ。GHCR への push は CI の build ワークフロー）
- 本番との比較: `go test -tags live ./internal/<ctx>/...`（必要な環境変数はテストの先頭に記載）

## 規約上の禁則

- `cmd/<service>/main.go` 以外で infra の具体実装を import しない
- usecase / domain から Redis や外部 API に直接触らない（repository / gateway 経由）
- **`*.gen.go` と `gen/` を手で編集しない**。proto を変えて `make proto-gen`
- Connect ハンドラを手書きしない（HTTP が必要な OAuth・ビーコンだけ `handler/*_http.go` に手書き）
- Usecase は entity を直接返さない（DTO / Output 型）
- 内部用の RPC（notification、worklocation の GetWorkLocation）を Gateway の HTTPRoute に出さない
- 同期予定の ID・ダイジェスト（calendarsync の `jsjson.go`）と予約の件名・説明文は旧実装と 1 文字も変えない（golden テストで守る）

## コミット・PR

- **ブランチ**: `feat/<author>/<topic>` / `fix/<author>/<topic>`
- **メッセージ**: Conventional Commits（`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`）
- **件名言語**: 英語 or 日本語（プロジェクトで統一）

## 利用可能な skill / subagent

`.claude/skills/` と `.claude/agents/` に配置済み。**skill / subagent 本体は技術非依存の workflow** であり、Go / REST / Postgres / GORM / proto といった**具体はこの CLAUDE.md から読み取られる**前提で書かれている。したがって技術スタックの変更はこのファイルだけで吸収でき、skill 本体を書き換えることはない。

### Skills（15）

| 種別 | Skill | 用途・トリガー例 |
| --- | --- | --- |
| 探索 | `backend-codebase-explorer` | 未知のコードベースを最短で把握。「このプロジェクト教えて」 |
| 仕様 | `backend-spec-creator` | `docs/spec/` に新規仕様書。「仕様書作って」 |
| 仕様 | `backend-spec-updater` | 既存仕様書の最小差分更新。「spec 更新して」 |
| 計画 | `backend-work-planner` | `docs/work/YYYYMMDD_*.md` に実装計画。「実装計画立てて」 |
| 開発 | `backend-dev-manager` | Phase 分解 + PDCA で実装オーケストレーション。「開発進めて」 |
| 開発 | `backend-refactor-planner` | リファクタの影響範囲・順序計画。「リファクタ計画立てて」 |
| 開発 | `backend-debug-session` | 仮説駆動のバグ調査。「バグ調査して」 |
| テスト | `backend-test-planner` | Unit / Integration の区分け込みテスト戦略設計。「テスト戦略立てて」 |
| テスト | `backend-test-writer` | 単体テスト(mock 前提)を既存パターンで実装。「テスト書いて」 |
| テスト | `backend-integration-test-writer` | 実 DB 起動の integration test を実装。「integration test 書いて」「E2E テスト追加して」 |
| テスト | `backend-test-gap-finder` | テスト不足箇所の洗い出し(unit / integration 両面)。「テストギャップ調べて」 |
| レビュー | `backend-code-reviewer` | 構造化観点のコードレビュー。「レビューして」 |
| 壁打ち | `backend-rubber-duck` | 問い返しで思考整理。「壁打ちして」 |
| Git/PR | `backend-commit-splitter` | 適切な粒度のコミット分割。「コミット分けて」 |
| Git/PR | `backend-pr-describer` | PR 説明文生成。「PR 説明書いて」 |

### Subagents（8）

| 種別 | Subagent | 用途 |
| --- | --- | --- |
| 実行 | `backend-worker` | 実装・テスト・ビルドの汎用ワーカー |
| 実行 | `backend-reviewer` | must/should/nit で指摘を返すレビュー専門（修正はしない） |
| 設計 | `backend-designer` | API・データモデル・エンティティの対話設計 |
| 実装スタイル | `backend-conservative` | 既存への影響を最小化、後方互換を最優先 |
| 実装スタイル | `backend-evolution` | 既存と調和させつつ段階的に改善 |
| 実装スタイル | `backend-greenfield` | ゼロベースで刷新（撤退戦略込み） |
| 運用 | `backend-git-rebase` | PR 作成前のコミット履歴整理 |
| 運用 | `backend-knowledge-manager` | `docs/knowledge/` の蓄積・検索・整理 |

**原則**: skill / subagent はどのプロジェクトでも共通。プロジェクト固有の判断（どの DB を使うか・どの層を生成するか・どんな命名規約か）はすべて **この CLAUDE.md から読ませる**。skill 本体を書き換えない。
