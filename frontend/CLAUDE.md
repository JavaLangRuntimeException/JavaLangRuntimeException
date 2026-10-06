# CLAUDE.md（frontend）

taramanji.com のフロントエンド。React 19 + Vite + TypeScript + React Router v8 + Tailwind CSS v4 + BoardUI（無料版）。
API は Go のマイクロサービスを Connect（connect-es）で呼ぶ。BoardUI の規則は [AGENTS.md](AGENTS.md)（必ず守る）。

## いちばん大事なこと: 内容は 1 文字も変えない

- 旧 Next.js 版（リポジトリ直下の `src/`）の **文言・リンク先・画像・データ・画面の流れ・入力の検証と文言・localStorage のキー** はそのまま移す
  - 文言はコピーする（言い換え・要約・敬体/常体の変更・句読点の変更・絵文字以外の記号の変更はしない）
  - 絵文字の見出し（🏢 など）は、言葉は残して絵文字だけ `@remixicon/react` のアイコンに置き換える
  - カードの「裏面」など、ホバーやめくりでしか見えなかった文言は常に見える説明として出す（内容は同じ）
- 変えるのは見た目だけ。消すもの: グラスモーフィズム、パーティクル、装飾のグラデーション、three.js の入場演出、framer-motion
- 残すもの（サイトの個性）: 背景に流れる CLI コマンド（`@/shared/ui/terminal`）、送信中のターミナル風ダイアログ、ナビと決定ボタンの Qiitan / Gopher、所属・スキルの色分け
- `/privacy` と `/calendar-sync` は Google の OAuth 審査に登録済み。文面は完全に同じにする

## デザイン

「AI が作ったテンプレート」に見えないこと、暗い背景でも読みやすいことを最優先にする。

### 飾りを付けない

- **飾りのアイコン・絵文字を付けない**: 見出し・フォームのラベル・案内文・カードの角・矢印（→ ↗）にアイコンを添えない。言葉だけで伝える
  - 使ってよいのは操作の役に立つものだけ: セレクトの開閉の矢印、閉じる（×）、前へ/次へ・前の週/次の週の矢印、検索欄の虫眼鏡、アイコンだけのボタン（`aria-label` 必須）、読み込み中のスピナー
  - 成功・失敗も大きなチェックマークではなく文章で伝える
- **ロゴを飾りに使わない**: SNS などはロゴの丸ボタンではなく文字のリンクにする。リンク集のロゴは同じ比率の面の中に小さく置き、普段は彩度を落とし、ホバー・フォーカスで本来の色にする
- **何でも箱で囲まない**: 区切りは細い線（`border-separator-border`）と余白。項目と値は `dl`（定義リスト）。箱が要るときだけ `Card`（角丸は `rounded-xl` まで。`rounded-2xl` 以上は使わない）
- グラデーション・グラスモーフィズム・光る影は使わない（例外は下の「動き」）

### 文字

- 書体は **IBM Plex Sans JP**（本文・見出し）と **IBM Plex Mono**（日付・メタ情報・メールアドレス・ターミナル）。`index.html` で読み込み、`src/app/styles.css` の `--font-inter` / `--font-mono-source` で BoardUI に渡す
- 本文 15px・行間 1.8・字間 0.02em。補足は 13〜14px。**12px 以下の文字で内容を書かない**（BoardUI の型は `src/app/theme.css` で日本語向けに上書き済み。`text-body-regular` = 15px など）
- 約物詰め（`palt`）は見出しだけ。本文はベタ組み
- 補助のユーティリティ: `prose-ja`（説明の段落）、`meta`（日付・件数・ラベル。等幅）
- 文字の大小・太さを CSS で変えて**表記を変えない**（`uppercase` で英字を大文字にしない。内容は 1 文字も変えない）

### 色とコントラスト

- **ダークテーマ固定**（`index.html` の `<html class="dark">`）。面の色と文字の色は `src/app/theme.css` で調整済み
  - 面: ページ `#0e0e10` < 区切った面 `#17171a` < 入力欄 `#1f1f23`（入力欄には 1px の輪郭が付く）
  - 文字: primary 約 16:1、secondary 7:1 以上、tertiary・placeholder 4.5:1 以上
- **文字はすべて 4.5:1 以上（大きい文字は 3:1）**。`npm run check:contrast`（dev サーバーを立てた状態）で全ページを確かめる。0 件でないと完了にしない
- アクセントは 1 色（`accent-*`）。暗い背景の上の文字は `text-accent-300`。`accent-600` 以上の文字は暗い背景で読めないので使わない
- 色は BoardUI のセマンティックトークン。生の色クラスは次の**例外**だけ:
  - データの識別色: 所属（`entities/affiliation` の `color`。白い文字が読めるよう黒を混ぜて沈める）、スキル（`entities/skill` の `color`。左の帯）、勤務場所（`LOCATION_STYLES`）、ORCID の種類
  - ナビの選択色（Links 青・WorkSpot 橙・Contact 緑・Ask Me 紫。白い文字が 4.5:1 以上になる濃さ）
  - ターミナル表示のプロンプトの緑、モーダルの暗幕
- 共通の部品: `@/shared/ui/layout`（PageContainer / PageHeader / Section / Card / Skeleton）、`@/shared/ui/dialog`、`@/shared/ui/terminal`（TerminalBackground / TerminalLoadingDialog）、BoardUI の `@/components/base/*`
- クラスの結合は `cx()`（`@/utils/cx`）

### 動き（`src/app/styles.css`）

- `lift`: カード・タグ。ホバーで 1.025 倍に浮き、アクセント色の淡い影をまとう。`Card` の `interactive` で付く
- `press`: ボタン・タブ・リンク。押した瞬間に 0.97 倍。`role="tab"` には全体で効く
- ページ遷移: `SiteLayout` の `AnimatePresence`（前のページは上へ消え、次はぼかしから浮かぶ。約 280ms）
- すべて `prefers-reduced-motion` で止まる（ページ遷移はフェードだけ、背景のコマンドは出さない）
- Tailwind v4 の `translate-*` と干渉しないよう、拡大縮小は `transform` ではなく `scale` プロパティで書く。`lift` / `press` と `transition-colors` を同じ要素に付けない（transition が上書きされる）

## FSD（Feature-Sliced Design）

```
src/
  app/        プロバイダー・ルーター・レイアウト・グローバル CSS
  pages/      URL ごとの画面（pages/<name>/index.tsx が default export）。組み立てるだけ
  widgets/    ページの大きな塊（ヘッダー、プロフィール、週グリッドなど）
  features/   利用者の操作（予約する、問い合わせる、検索する、ログインする …）
  entities/   業務の名詞（article, work-location, slot, …）: 型・API 呼び出し・表示部品
  shared/     どこにも依存しない部品: api（connect-es のクライアント・エラー変換）、lib、config、ui、model
  components/ styles/ utils/   BoardUI が `npx boardui add` で置くソース（shared 層の UI キット扱い。手で大きく書き換えない）
```

- import は上の層 → 下の層だけ（pages → widgets → features → entities → shared）。同じ層のスライス同士は import しない
- スライスの外へは `index.ts` で公開したものだけを使う
- API: `@/shared/api/clients`（identityApi・inquiryApi・reservationApi・workLocationApi・contentApi・calendarSyncApi）。生成型は `@/shared/api/gen/...`
- エラー: `toApiError(err)`（`@/shared/api/errors`）で `{ code, message, detail, fields }` にする。`code` は旧 API のエラー文字列（`invalid_email` など）
- サーバーの状態は TanStack Query（`useQuery` / `useMutation`）。フォームの保持（10 分で消える localStorage）は jotai の `atomWithStorage` + `createTTLStorage`（`@/shared/lib/ttl-storage`）で、キー名は旧実装と同じ
- フォームは react-hook-form + zod（旧 `src/shared/validation/*` のスキーマと文言をそのまま）

## コマンド

- `npm run dev` — 開発サーバー（API は kind の Gateway へプロキシ。`GATEWAY_URL` で変更可）
- `npm run gen` — proto（../backend/proto）から connect-es の型を生成
- `npm run typecheck` / `npm run build` / `npm test` / `npm run lint:fsd`
- `npm run check:contrast [URL]` — 全ページの文字のコントラスト（既定は http://localhost:5173。staging なら https://next.taramanji.com）

## 利用可能な skill / subagent

`.claude/skills/` と `.claude/agents/` に配置済み（全文は `.claude/all-skills-and-subagents.md`）。**skill / subagent 本体は技術非依存の workflow** であり、React / Vite / FSD / BoardUI / connect-es といった**具体はこの CLAUDE.md と AGENTS.md から読み取られる**前提で書かれている。したがって技術スタックや規約の変更はこの 2 ファイルだけで吸収でき、skill 本体を書き換えることはない。

### Skills（15）

| 種別 | Skill | 用途・トリガー例 |
| --- | --- | --- |
| 探索 | `frontend-codebase-explorer` | 画面一覧・層・データの流れ・デザインシステムを最短で把握。「このプロジェクト教えて」 |
| 仕様 | `frontend-spec-creator` | `docs/spec/` に画面仕様（文言・状態・操作・検証・API・a11y）。「画面仕様書いて」 |
| 仕様 | `frontend-spec-updater` | 既存の画面仕様の最小差分更新。「spec 更新して」 |
| 計画 | `frontend-work-planner` | `docs/work/YYYYMMDD_*.md` に実装計画（層への配置・状態の置き場所）。「実装計画立てて」 |
| 開発 | `frontend-dev-manager` | Phase 分解 + PDCA で実装をオーケストレーション（共通層 → スライス並列）。「開発進めて」 |
| 開発 | `frontend-refactor-planner` | 見た目と振る舞いを変えないリファクタの影響範囲・順序計画。「リファクタ計画立てて」 |
| 開発 | `frontend-debug-session` | 再現 → DevTools で観察 → 仮説 → 検証の不具合調査。「画面が崩れる」「バグ調査して」 |
| テスト | `frontend-test-planner` | 単体 / コンポーネント / E2E / 見た目の担当範囲を設計。「テスト戦略立てて」 |
| テスト | `frontend-test-writer` | 単体・コンポーネントテスト（振る舞いを検証）を既存パターンで実装。「テスト書いて」 |
| テスト | `frontend-e2e-test-writer` | ブラウザで主要な流れを通す E2E（スマホ幅・横スクロール・コンソールエラー検査）。「E2E 書いて」 |
| テスト | `frontend-test-gap-finder` | テスト不足箇所の洗い出し（単体 / E2E 両面）。「テストギャップ調べて」 |
| レビュー | `frontend-code-reviewer` | 正確性・内容の同一性・FSD 境界・BoardUI 規則・a11y・性能の観点でレビュー。「レビューして」 |
| 壁打ち | `frontend-rubber-duck` | 問い返しで思考整理。「壁打ちして」 |
| Git/PR | `frontend-commit-splitter` | 生成物・UI キット・見た目・振る舞いを分けたコミット分割。「コミット分けて」 |
| Git/PR | `frontend-pr-describer` | スクリーンショット付きの PR 説明文生成。「PR 説明書いて」 |

### Subagents（8）

| 種別 | Subagent | 用途 |
| --- | --- | --- |
| 実行 | `frontend-worker` | 実装・テスト・ビルド・スクリーンショット確認の汎用ワーカー |
| 実行 | `frontend-reviewer` | must/should/nit で指摘を返すレビュー専門（修正はしない） |
| 設計 | `frontend-designer` | UI/UX・デザインシステム（情報設計・部品選定・モーション・a11y）の対話設計 |
| 実装スタイル | `frontend-conservative` | 見た目・文言・URL・永続化キーを変えず、既存部品だけで安全に追加 |
| 実装スタイル | `frontend-evolution` | 既存と調和させつつ段階的に改善（部品の置き換え・状態管理の移行） |
| 実装スタイル | `frontend-greenfield` | ゼロベースで刷新（目標の数値化・比較・撤退戦略込み） |
| 運用 | `frontend-git-rebase` | PR 作成前のコミット履歴整理（バックアップ必須） |
| 運用 | `frontend-knowledge-manager` | `docs/knowledge/` の蓄積・検索・整理 |

**原則**: skill / subagent はどのプロジェクトでも共通。プロジェクト固有の判断（どの層に置くか・どのトークンを使うか・文言をどう扱うか）はすべて **この CLAUDE.md と AGENTS.md から読ませる**。skill 本体を書き換えない。
