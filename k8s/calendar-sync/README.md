# カレンダー同期（オンプレ k8s）

複数の Google アカウント（会社の Workspace・個人の Gmail・自分のドメインの Workspace）のメインカレンダーを、「予定あり」として相互に同期します。
calendar-busy-sync の同期処理を Next.js に移植し、Mac mini の k8s で動かしています。管理画面は https://gws.taramanji.com/admin です。gws.taramanji.com はこの管理画面専用で、それ以外の URL は taramanji.com へ転送します（`src/middleware.ts`）。ログインできるのは `ADMIN_EMAIL`（shuta.tanahashi@taramanji.com）だけです。

- **マスター**（taramanji.com のアカウントを想定）には、他のアカウントの予定がタイトル・場所・説明・Google Meet の URL・元のカレンダー名付きで入ります。参加者はコピーしません（招待メールが送られるため）
- マスター以外のアカウントには「予定あり」（非公開・通知なし・Busy）だけが入ります
- 「マスターで非公開」にしたアカウントの予定は、マスターでも非公開の予定として入ります（家族の予定など）
- 時間指定の「予定なし」は、マスターとの間でだけ「予定なし」のまま同期します（マスターから他へは「予定あり（MTG可能）」）
- 日時の変更・削除も反映します。繰り返し予定は 1 回ずつ同期します。辞退した招待・終日の「予定なし」・勤務場所は同期しません
- 同じ招待が両方のアカウントにある場合は `iCalUID` で重複を避けます。同期でできた予定には印を付け、連鎖を防ぎます
- 過去 1 日から 90 日先までを 5 分ごとに同期します（`SYNC_DAYS` で変更可）

calendar-busy-sync から変えた点:

- アカウントの接続・解除・マスター設定は管理画面で行います。解除すると、そのアカウントにある同期予定も削除します
- 1 つのアカウントの接続が切れても（パスワード変更・アクセス取り消しなど）、他は同期を続けます。そのアカウント分の同期予定は消しません。管理画面に「要再接続」と表示されます
- 1 回の同期は 4 分で打ち切り、残りの書き込みは次回に回します（初回は数千件になることがあるため）
- 更新トークンは AES-256-GCM で暗号化して Redis に保存します
- 予定 ID と印は calendar-busy-sync と同じです。以前その CLI で同期していても、同じ予定が二重にできることはありません

コードは `src/feature/calendar-sync/`（同期処理 `reconcile.ts` は外部に触れない処理で、テストは `pnpm test:calendar-sync`）、API は `src/app/api/calendar-sync/` です。

## Google Cloud 側の準備（初回のみ）

gws と taramanji.com の管理画面のログイン、アカウントの接続には、同じ OAuth クライアント（Google Cloud の taramanji-calendar-sync プロジェクト、ウェブ アプリケーション）を使います。

1. Google Cloud のプロジェクトで **Google Calendar API** を有効にします。
2. 「OAuth 同意画面」で、次の 2 つを設定します。
   - スコープに `.../auth/calendar.events` を追加する（予定の読み書きはこれだけで足りる）
   - 公開ステータスを **本番環境（In production）** にする。テストのままだと、更新トークンが 7 日で失効します。審査を受けていないので、接続時に「Google はこのアプリを確認していません」と表示されます。「詳細」→「（安全ではないページ）に移動」で進めます
3. OAuth クライアントの「承認済みのリダイレクト URI」に、次の 3 つを追加します。
   - `https://gws.taramanji.com/api/auth/callback/google`（カレンダー同期の管理画面のログイン）
   - `https://gws.taramanji.com/api/calendar-sync/callback`（アカウントの接続）
   - `https://taramanji.com/api/auth/callback/google`（サイトの管理画面のログイン）

### 会社の Workspace のアカウントを接続できないとき

組織が外部アプリの接続を制限していると、「管理者によってブロックされています」と表示されます。その場合は組織の管理者に、管理コンソールの「セキュリティ」→「API の制御」→「アプリのアクセス制御」で、この OAuth クライアント ID を「信頼できる」に追加してもらう必要があります。

## デプロイ

```bash
cd k8s/calendar-sync
cp secret.env.example secret.env   # 値を記入（.gitignore 済み）
kubectl --context orbstack apply -k .
```

イメージのビルドは `../README.md` を参照してください（portfolio と共通の `taramanji-web:local`）。

```bash
kubectl --context orbstack -n calendar-sync create job --from=cronjob/calendar-sync manual-$(date +%s)  # 手動で同期
kubectl --context orbstack -n calendar-sync logs deploy/calendar-sync | grep calendar-sync             # 実行結果
kubectl --context orbstack -n calendar-sync patch cronjob calendar-sync -p '{"spec":{"suspend":true}}'  # 自動同期を止める
```

## 注意

- 同期は最大で約 5 分遅れます
- 同期先の「予定あり」を手で消すと、元の予定が変わるまで作り直しません
- `CALENDAR_SYNC_ENC_KEY` を変えると、保存済みの更新トークンを読めなくなります（全アカウントの再接続が必要）
