---
name: frontend-work-planner
description: docs/spec/ の画面仕様書を元に、docs/work/YYYYMMDD_<feature>.md として実装計画書を作成する。層ごとの配置（どのスライスに何を置くか）・共通部品の流用・Phase 分解・影響範囲・テスト戦略（単体 / E2E）・リスクを構造化し、実装前にユーザー承認を取る。「実装計画立てて」「work 書いて」「どう進めるか計画して」などで起動。
---

# Frontend Work Planner

仕様から **どう作るか** を計画する。コードは書かない（参考パスの列挙まで）。

## 手順

1. 仕様書（`docs/spec/`）と CLAUDE.md / AGENTS.md を読む
2. 既存の類似画面・共通部品・API クライアントを調査する（Explore）
3. 配置を決める: 画面 / 大きな塊 / 操作 / 業務の名詞 / 共通 のどこに何を置くか（プロジェクトの層の規約に従う）
4. Phase に分解し、並列にできる部分を明示する
5. `docs/work/YYYYMMDD_<feature>.md` に書き、ユーザーの承認を取る

## テンプレート

```markdown
# <機能名> 実装計画

## 1. 前提
- 仕様: docs/spec/<name>-spec.md
- 対象 URL / 画面

## 2. 配置
| 層 / スライス | 新規 / 変更 | 内容 | 参考 |

## 3. 使う共通部品・API
| 部品 / API | 用途 | 既存 or 追加 |

## 4. 状態の置き場所
| 状態 | 種類（サーバー / 画面 / 永続化） | 置き場所 | キー |

## 5. Phase
| Phase | 内容 | 依存 | 並列 |
| 1 | entities: 型と API 呼び出し | - | |
| 2 | features: 操作 | 1 | |
| 3 | widgets / pages: 画面の組み立て | 2 | |
| 4 | テスト | 3 | 単体と E2E は並列 |

## 6. テスト戦略
- 単体: <ロジック・検証・状態遷移>
- E2E: <主要な流れ・スマホ幅>
- 見た目: <スクリーンショットの確認範囲>
- 実行しない操作: <本番データに書き込む送信など>

## 7. 影響範囲
- 共通部品の変更が及ぶ画面

## 8. リスクと対策

## 9. 完了条件
- typecheck / lint / test / build が通る
- 仕様のルール R-xx をすべて満たす
- デスクトップ幅・スマホ幅で崩れない、横スクロールが出ない
```

## 原則

- 仕様にない振る舞いを足さない（足すなら仕様の更新を先に）
- 共通層の変更は影響範囲を必ず書く
- 承認前に実装を始めない

## 関連

- [frontend-spec-creator](../frontend-spec-creator/SKILL.md)
- [frontend-dev-manager](../frontend-dev-manager/SKILL.md)
- [frontend-test-planner](../frontend-test-planner/SKILL.md)
