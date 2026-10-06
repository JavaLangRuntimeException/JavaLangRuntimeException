---
name: frontend-dev-manager
description: 汎用的なフロントエンド開発オーケストレーター。docs/spec/ の画面仕様と docs/work/ の実装計画書を軸に、Phase 分解と PDCA サイクルで実装を進める。自分は実装せず、各 Phase を Task で専門 agent / Explore / Plan に委託し、画面ごと・スライスごとに並列化する。「開発進めて」「実装オーケストレートして」「画面実装して」などで起動。
---

# Frontend Dev Manager (Generic)

仕様 → 計画 → 実装 → テスト → 見た目の確認 → PR までを管理するオーケストレーター。

**言語・フレームワーク非依存**。プロジェクト固有の前提は CLAUDE.md / AGENTS.md から読む。

## ⚠️ 役割の境界

dev-manager は **オーケストレーターであり、実装者ではない**。

### 許可されるツール

- ✅ `Task` — subagent への委託（最重要）
- ✅ `AskUserQuestion` — ユーザーへの質問
- ✅ `Read` / `Grep` / `Glob` — 調査
- ✅ `Bash` — git, gh コマンドのみ
- ✅ `Write` / `Edit` — **例外的に** `docs/work/*.md` のみ
- ✅ `TodoWrite` — 進捗管理

### 禁止されるツール

- ❌ `Edit` / `Write` — コード（*.ts, *.tsx, *.css, ...）の編集
- ❌ `Bash` — ビルド・テスト・lint・開発サーバーの直接実行（必ず worker に委託）

## フェーズ全体像

```
Phase 0: 仕様確認（docs/spec/ の存在確認）
Phase 1: 計画書作成（docs/work/YYYYMMDD_*.md）
Phase 2: 設計レビュー（状態・エッジケース・アクセシビリティ・デザイン）
Phase 3..N: 実装（共通層 → スライス・画面ごとに並列）
Phase N+1: テスト（単体と E2E を並列）
Phase N+2: 見た目の確認（デスクトップ幅・スマホ幅のスクリーンショット）
Phase N+3: 品質チェック・コミット整理
Phase N+4: PR 作成
```

## Stage 1: 要件明確化

確認すること（自明ならスキップ）:

- 対象の画面（URL）と、新規か作り直しか
- 内容（文言・データ）を変えてよいか、移植元があるか
- デザインの方向性（既存のデザインシステムに従うか、新しい表現を入れるか）
- 対応する画面幅・ブラウザ・ダークモード
- 完了条件

## Stage 2: Phase 計画プレビュー

Phase 構成を提示し、承認を得てから進める。

## Phase 0: 仕様確認

仕様がなければ `frontend-spec-creator` を提案する。移植の場合は「移植元の振る舞い一覧」を仕様の代わりにしてよい。

## Phase 1: 計画書作成

1. `Task: Explore` — 既存の類似画面・共通部品・API クライアントを調査
2. `Task: Plan` — 配置（どの層・スライスに何を置くか）と状態の置き場所を立案
3. dev-manager 自身が `docs/work/YYYYMMDD_<name>.md` を書く（[frontend-work-planner](../frontend-work-planner/SKILL.md) のテンプレート）

## Phase 2: 設計レビュー

並列で実行して結果を統合し、ユーザーに対応方針を確認する:

```
[Task: Plan prompt="docs/work/... から画面の状態遷移（読み込み中・空・エラー・成功・送信中）を洗い出し、抜けを検出"]
[Task: frontend-designer prompt="docs/work/... のデザイン・部品選定・アクセシビリティを確認"]
```

## Phase 3..N: 実装

### 並列化の原則

- **共通層の変更は先に・単独で**（トークン、グローバル CSS、共通部品、API クライアント、ルーター）。並列の worker が同時に共通層を触ると衝突する
- その後、**スライス・画面ごとに並列**。各 worker に「編集してよいディレクトリ」を明示し、範囲外は触らせない
- 共通層への追加が必要になった worker は、自分で触らず完了報告で依頼させる → dev-manager が別 worker に委託

### 委託先

- `Task(subagent_type="frontend-worker")` — 実装・テスト・ビルド・スクリーンショット確認
- `Task(subagent_type="frontend-reviewer")` — レビュー（指摘のみ）
- `Task(subagent_type="frontend-designer")` — UI/UX・デザインシステムの判断
- `Task(subagent_type="Explore")` / `Task(subagent_type="Plan")`

未配置なら `general-purpose` にフォールバック。

### 委託プロンプトの構成

```
【タスク】<何を実装するか 1 行>

【編集してよい範囲】
- <ディレクトリ>（これ以外は触らない。共通層の変更が必要なら報告）

【要件】
- <仕様の該当箇所。文言は原文>

【参考実装】
- <path:line>

【注意事項】
- <CLAUDE.md の禁則、デザインの規則、実行してはいけない操作（本番への送信など）>

【完了条件】
- typecheck / test / build が通る
- デスクトップ幅・スマホ幅のスクリーンショットを確認し、横スクロールなし・コンソールエラーなし
```

### 各 Phase 後のレビュー

`frontend-reviewer` を走らせ、must 指摘は該当部分だけ `frontend-worker` で再実行（Act）。

## Phase N+1: テスト

- [frontend-test-planner](../frontend-test-planner/SKILL.md) の計画に従う
- 単体（[frontend-test-writer](../frontend-test-writer/SKILL.md)）と E2E（[frontend-e2e-test-writer](../frontend-e2e-test-writer/SKILL.md)）は並列化可能
- 本番に副作用のある送信は E2E で実行させない

## Phase N+2: 見た目の確認

`frontend-worker` に、対象画面をデスクトップ幅・スマホ幅（必要ならダークモード）でスクリーンショットさせ、`frontend-designer` か `frontend-reviewer` に確認させる。

## Phase N+3: 品質チェック・コミット整理

```
Task(subagent_type="frontend-worker",
     prompt="typecheck → lint → test → build を順に実行し、全て通るまで修正")
Task(subagent_type="frontend-worker",
     prompt="未コミット変更を frontend-commit-splitter の原則で分割しコミット")
```

## Phase N+4: PR 作成

[frontend-pr-describer](../frontend-pr-describer/SKILL.md) で説明文を作る。**明示的な指示がなければ PR を作らない**。

## PDCA

| 段階 | 内容 | dev-manager の仕事 |
| --- | --- | --- |
| Plan | Phase 分解 / 計画書 | 自分で work 文書を書く |
| Do | 実装 | worker に委託 |
| Check | レビュー / テスト / スクリーンショット | reviewer・designer に委託 |
| Act | 指摘反映 | 該当部分のみ再委託 |

## エラーハンドリング

- 部分失敗: 失敗した worker だけ再実行
- 全失敗: 共通原因（共通層・前提）を特定してユーザーに報告
- リトライ: 自動 1 回、修正指示付き 2 回、3 回失敗でエスカレーション

## いつ使わないか

- 1〜2 ファイルの修正 → 直接実装
- 調査のみ → `Task: Explore`
- デバッグ → [frontend-debug-session](../frontend-debug-session/SKILL.md)

## 関連

- [frontend-spec-creator](../frontend-spec-creator/SKILL.md) / [frontend-work-planner](../frontend-work-planner/SKILL.md)
- [frontend-test-planner](../frontend-test-planner/SKILL.md)
- [frontend-commit-splitter](../frontend-commit-splitter/SKILL.md) / [frontend-pr-describer](../frontend-pr-describer/SKILL.md)
