# オンプレ k8s（Mac mini / OrbStack）

taramanji.com の Next.js アプリを Mac mini の Kubernetes で動かします。イメージは 1 つで、用途ごとに namespace を分けています。

| ディレクトリ | 内容 | Mac mini からの URL |
| --- | --- | --- |
| `portfolio/` | taramanji.com 本体（2 台構成 + Redis） | http://localhost:8080 |
| `calendar-sync/` | 複数の Google アカウントのカレンダー同期（管理画面 + 5 分ごとの CronJob + Redis）。詳細は `calendar-sync/README.md` | https://gws.taramanji.com/admin |
| `redis/` | 上の 2 つがそれぞれの namespace に置く Redis | - |
| `cloudflared/` | 外部公開用の Cloudflare Tunnel | - |
| `datadog/` | Datadog Agent（Helm）。Pod・Redis・トンネル・カレンダー同期のメトリクスとログ | https://us5.datadoghq.com |

## 準備

OrbStack の設定で Kubernetes を有効にします（`orbctl config set k8s.enable true` のあと OrbStack を再起動）。

## ビルド

リポジトリのルートで実行します。OrbStack の k8s はローカルの Docker イメージをそのまま使うので、レジストリへの push は不要です。

```bash
docker build -f k8s/Dockerfile -t taramanji-web:local \
  --build-arg NEXT_PUBLIC_BEARER_TOKEN=<Qiita のアクセストークン> .
```

`NEXT_PUBLIC_BEARER_TOKEN`（/blogs の Qiita API 用）はビルド時に埋め込まれるので、ビルド引数で渡します。省略すると Qiita API を未認証で呼びます（レート制限が厳しくなります）。

## デプロイ

```bash
cd k8s
cp portfolio/secret.env.example portfolio/secret.env   # Vercel の環境変数と同じ値を記入
kubectl --context orbstack apply -k portfolio
kubectl --context orbstack apply -k calendar-sync      # calendar-sync/README.md の準備が済んでから

# イメージを作り直したとき
kubectl --context orbstack -n portfolio rollout restart deploy/portfolio
kubectl --context orbstack -n calendar-sync rollout restart deploy/calendar-sync
```

`secret.env` と `config.json` は .gitignore 済みです。

portfolio の Redis は既定で namespace 内のもの（`redis://redis:6379`）を使います。Vercel 版と予約・勤務場所のデータを共有したい場合は、`REDIS_URL` を本番の Redis に変えてください。

## 外部公開（Cloudflare Tunnel）

Mac mini から Cloudflare へ外向きに接続するので、ルーターのポート開放は不要です。
振り分けは `cloudflared/config.yaml`（ホスト名 → k8s の Service）で管理し、DNS に登録したホスト名だけが公開されます。

### 1. DNS を Cloudflare に移す（初回のみ）

トンネルのホスト名を使うには、taramanji.com の DNS ゾーンが Cloudflare にある必要があります。手順は `../dns/README.md` にあります。

### 2. トンネルを作って公開する

```bash
cloudflared tunnel login                     # 初回のみ。ブラウザで taramanji.com を選ぶ
./k8s/cloudflared/setup.sh gws.taramanji.com # トンネル作成 → DNS 登録 → k8s へデプロイ
```

`setup.sh` は何度実行しても同じ結果になります。ホスト名を足すときは引数に加えて再実行します。

### taramanji.com 本体を Mac mini に切り替える場合

1. `portfolio/secret.env` に Vercel と同じ値を入れ、`kubectl apply -k portfolio` で反映します。
2. Google OAuth のリダイレクト URI に `https://taramanji.com/api/auth/callback/google` と `https://www.taramanji.com/api/auth/callback/google` があることを確認します。
3. Cloudflare で `taramanji.com` / `www` の Vercel 向け A レコードを削除し、`./k8s/cloudflared/setup.sh taramanji.com www.taramanji.com` を実行します。
4. 戻すときは、そのレコードを削除して Vercel 向けの A レコードを作り直します。

管理画面のログイン用に、Google OAuth クライアントのリダイレクト URI に公開するホストの `/api/auth/callback/google` を追加してください（gws は `calendar-sync/README.md` 参照）。

## 監視（Datadog）

```bash
./k8s/datadog/install.sh ~/Downloads/dd-api-key.txt   # 初回（API キーをファイルから Secret に入れる。終わったらファイルは消す）
./k8s/datadog/install.sh                              # 設定（values.yaml）を変えたとき
```

ダッシュボード「taramanji.com on Mac mini (k8s)」は `k8s/datadog/dashboard.py` で作成・更新します（同じタイトルを上書き）。
初回だけ Application Key のファイルを渡すと Secret（`datadog/datadog-app-key`）に保存され、以降は引数なしで実行できます。

| 集めるもの | 仕組み |
| --- | --- |
| Pod の CPU・メモリ・再起動・状態 | Agent の kubelet / kubernetes_state_core チェック（自動） |
| ログ | 全コンテナ（`logs.containerCollectAll`）。アプリは `source:nodejs` |
| Redis | Pod の注釈 `ad.datadoghq.com/redis.checks`（`redis/redis.yaml`） |
| トンネル | cloudflared の `:2000/metrics` から 5 項目だけ（`cloudflared/cloudflared.yaml`。カスタムメトリクスは課金対象なので絞る） |
| カレンダー同期 | アプリから DogStatsD で送る `calendar_sync.*`（`src/lib/dogstatsd.ts`、`src/feature/calendar-sync/sync.ts`） |

アプリの Pod には Unified Service Tagging（`tags.datadoghq.com/env|service|version`）を付けています。
