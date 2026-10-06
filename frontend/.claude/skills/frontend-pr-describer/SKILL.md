---
name: frontend-pr-describer
description: コミット履歴と差分から質の高いフロントエンドの Pull Request 説明文を生成する。Summary / Changes / Screenshots（変更前後・デスクトップ幅とスマホ幅）/ Test plan / Risk を構造化し、レビュアーが 30 秒で理解できる PR を作る。「PR 説明書いて」「PR description 作って」「pull request の本文を整えて」などで起動。
---

# Frontend PR Describer

## 実行手順

### 1. ベースブランチを特定

`git remote show origin | grep "HEAD branch"`。指定があればそれを使う。

### 2. 差分情報を収集

```bash
git log <base>..HEAD --oneline
git log <base>..HEAD --stat
git diff <base>...HEAD --name-status
git diff <base>...HEAD        # 大きい場合は代表ファイルのみ
```

### 3. 影響する画面を特定する

- 変更ファイル → 画面（URL）の対応表を作る（共通部品の変更は使っている全画面）
- 見た目が変わる画面は、変更前後のスクリーンショットをデスクトップ幅・スマホ幅で撮る（撮れない場合は Test plan に「目視確認」を入れる）

### 4. テンプレート

```markdown
## Summary
<何を・なぜ。1〜3 行>

## Changes
- <変更点>

## 影響する画面
| URL | 変更内容 |

## Screenshots
| 画面 | Before | After |
|  | デスクトップ / スマホ | デスクトップ / スマホ |

## Test plan
- [ ] typecheck / lint / test / build
- [ ] <E2E の流れ>
- [ ] スマホ幅で横スクロールなし・コンソールエラーなし
- [ ] キーボード操作・フォーカス
- [ ] ダークモード（あれば）

## Risk / Notes
- <文言・永続化キー・URL・計測イベントの変更有無>
- <バンドルサイズの増減>
- <ロールバック方法>
```

### 5. 出力

- 文章はユーザーに提示する。**明示的な指示がなければ `gh pr create` しない**

## 原則

- 文言・永続化キー・URL の変更は必ず Risk に書く（利用者のデータや外部リンクに影響する）
- 「何を」より「なぜ」
- レビュアーが見るべき順番（共通層 → 画面）を示す
