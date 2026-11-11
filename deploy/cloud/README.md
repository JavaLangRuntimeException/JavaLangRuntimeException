# taramanji cloud

自分だけが使う小さなクラウド（マネジメントコンソール・ストレージ・コンテナ / 関数 / インスタンス）。
taramanji.com・gws.taramanji.com と同じクラスター（kind）で動くが、セキュリティの境界は分けてある。

| 環境 | コンソール | 名前空間 | メトリクス |
|---|---|---|---|
| prod | https://cloud.taramanji.com | `cloud` | あり（Datadog） |
| stg | https://cloud-stg.taramanji.com | `cloud-stg` | なし |
| dev | https://cloud-dev.taramanji.com | `cloud-dev` | なし |

バケット・アプリの URL（③・④で作る）は 1 階層のサブドメイン（Universal SSL がそのまま使える）:
`<バケット>-storage.taramanji.com`・`<アプリ>-hosting.taramanji.com`（stg・dev は `-storage-stg`・`-hosting-dev` など）。

## taramanji.com から切り離しているところ

- **入口**: 専用のトンネル（`taramanji-cloud`、名前空間 `cloud-cloudflared`）→ 専用の Gateway（`cloud-gateway/cloud`、Envoy の Pod も別）。
  cloudflared の送信先は NetworkPolicy で cloud の Envoy とクラスターの外だけに絞り、taramanji の Gateway の Envoy からは
  cloud の Pod に届かない（`from-cloud-gateway`）。逆に taramanji のサービス（`from-gateway`）も taramanji の Envoy からしか受けない
- **ログイン**: Cloudflare Access の専用アプリ（`taramanji-cloud`）。API（cloud-api）は `Cf-Access-Jwt-Assertion` の署名・
  `iss`・`aud`（このアプリの Audience タグ）・メールアドレスを毎回確かめる（`backend/pkg/util/cfaccess`）。
  taramanji.com のセッション（`AUTH_SECRET`）や Redis は使わない
- **Secret**: taramanji の Secret は使わず、`deploy/cloud/secrets/`（git に入らない）から SealedSecret を作る
- **Argo CD**: 専用の AppProject（`cloud`）。同期できる名前空間は cloud の 5 つだけ、クラスター全体のリソースは Namespace だけ
- **権限**: cloud-api の ServiceAccount は読むだけ（自分の名前空間の Deployment・StatefulSet、アプリ用名前空間の枠と Pod、ノードの容量と使用量）

## アプリの容量（taramanji.com・gws に影響させない）

アプリ（④）は環境ごとのアプリ用名前空間（`cloud-apps`・`cloud-stg-apps`・`cloud-dev-apps`）に置き、`workloads/` で次の 3 つを縛る。

| | 縛り方 |
|---|---|
| 量 | ResourceQuota `apps`。メモリは LimitRange で requests = limits にそろえ、予約した分がそのまま実際に使える上限になる |
| 順番 | PriorityClass `cloud-workload`（-100・他を押しのけない）。メモリが足りなくなったら taramanji より先に追い出される。付けていない Pod は作れない（ResourceQuota `require-cloud-priority`） |
| 通信 | taramanji・data（Redis）・Kubernetes API・LAN には届かない。受けるのは cloud の Gateway からだけ。NodePort・LoadBalancer は作れない。Pod Security は baseline（hostPath・特権コンテナ不可） |

枠の大きさ（Mac mini の OrbStack VM は 11.7 GiB。taramanji.com・gws・基盤がおよそ 5.5 GiB を使う）:

| 環境 | メモリ | CPU（limits） | Pod | ディスク |
|---|---|---|---|---|
| prod | 2.5 GiB | 4 | 30 | 50 GiB |
| stg | 512 MiB | 1 | 10 | 10 GiB |
| dev | 512 MiB | 1 | 10 | 10 GiB |

合わせて 3.5 GiB をアプリに渡し、2 GiB を taramanji.com・gws の伸びしろに残す（cloud-api の `CAPACITY_RESERVE_MIB`）。
VM のメモリを増やしたら `overlays/prod/workloads` の枠を広げる。

コンソールの「容量」は、この枠の残りと Mac mini 全体の実際の空き（予約分を除く）の、先に尽きる方で「S / M / L / XL のアプリがあと何個置けるか」を出す。
ストレージ（バケット）の容量は ③ で足す。

## ホスティング（コンテナ）

アプリの正は、**アプリ専用のリポジトリ**（`JavaLangRuntimeException/taramanji-cloud-apps`）にある Kubernetes の YAML。
`<環境>/<名前>.yaml`（`prod/blog.yaml` など）に Deployment・Service・HTTPRoute を書く。

- コンソール（ホスティング → コンテナ）のフォームで作る・変える・消すと、cloud-api がそのファイルをコミットする。クラスターには書かない
- Argo CD の `cloud-apps-<環境>`（プロジェクト `cloud-apps`）が、そのディレクトリをアプリ用 namespace に入れる
- YAML を手で書いて push しても同じ。コンソールの「YAML」タブで直接編集もできる。手で書き足した YAML は、フォームでは編集できない（保存すると消えるため）

リポジトリを分けているのは、コンソールのトークンが漏れても taramanji.com のマニフェスト（このリポジトリ）を書き換えられないようにするため。
プロジェクト `cloud-apps` は、入れ先をアプリ用 namespace に、種類を Deployment・Service・ConfigMap・PersistentVolumeClaim・HTTPRoute に限る。

**インスタンスタイプ**（EC2 と同じ「ファミリー + 世代 . サイズ」。`backend/internal/cloud/domain/service/instancetype.go`）:

| 名前 | CPU | メモリ |
|---|---|---|
| `t1.small` | 0.1 | 128 MiB |
| `t1.medium` | 0.25 | 256 MiB |
| `t1.large` | 0.5 | 512 MiB |
| `t1.xlarge` | 1 | 1 GiB |

型を選ぶと CPU・メモリが入り、そのあと個別に変えられる（CPU 10〜1000 ミリコア、メモリ 16〜1024 MiB。上限は LimitRange の max）。
YAML ではラベル `cloud.taramanji.com/instance-type` が型、`resources` が実際の値（requests = limits）。

**監視**: Deployment の注釈で、用意した監視と通知先を選ぶ。

```yaml
metadata:
  annotations:
    cloud.taramanji.com/alerts: cpu-high,memory-high,restarts,unavailable,http-5xx
    cloud.taramanji.com/notify: mail,discord
```

本番では cloud-api がこれを Datadog のモニター（タグ `managed-by:taramanji-cloud`）にする。Datadog には必ず出て、
`mail` は SES のメール、`discord` は Discord に飛ぶ（Datadog の Webhook `taramanji-cloud-mail`・`taramanji-cloud-discord` →
Cloudflare Worker `taramanji-uptime`）。コンソールで保存・削除したときにそろえる。YAML を手で push したときは、コンソールの「監視を同期」を押す。
stg・dev は Datadog で監視していないので、注釈は残るが通知は飛ばない。

まだないもの: アプリの URL（`<名前>-hosting.taramanji.com`）の DNS は自動では作らない。アプリごとに
`cloudflared tunnel route dns taramanji-cloud <名前>-hosting.taramanji.com` を実行する。秘密の環境変数・非公開イメージもまだ扱えない。

## 構成

```
deploy/cloud/
  platform/        全環境で 1 つ（prod の Application が持つ）: 名前空間・Gateway（cloud）・トンネル（cloudflared）
  cluster/         クラスター全体のもの（PriorityClass・ノードを読む ClusterRole）。cloud-cluster アプリ（default プロジェクト）が持つ
  base/            1 環境ぶん: cloud-api（Go、backend/cmd/cloud）・console（console/ の画面）・HTTPRoute・NetworkPolicy
  workloads/       1 環境ぶんのアプリ用名前空間の枠と囲い（ResourceQuota・LimitRange・NetworkPolicy）
  overlays/
    prod/          platform + app（base）+ workloads + sealed
    stg/ dev/      app（base。ホスト名・環境名だけ変える）+ workloads + sealed
  scripts/seal.sh  SealedSecret を作る
  secrets/         平文の入力（git に入らない）
```

`/taramanji.cloud.v1.*` は cloud-api、それ以外は console（nginx）に送る。

## はじめて動かすとき

1. **トンネル**（1 本を全環境で使う）

   ```sh
   cloudflared tunnel create taramanji-cloud
   cp ~/.cloudflared/<トンネルの ID>.json deploy/cloud/secrets/tunnel-cloud.json
   for h in cloud cloud-stg cloud-dev; do cloudflared tunnel route dns taramanji-cloud $h.taramanji.com; done
   ```

2. **Access**（`taramanji-cloud` アプリを作り、Audience タグを `deploy/cloud/secrets/access.env` に書く）

   ```sh
   python3 deploy/cloudflare/access.py
   ```

3. **Datadog**（prod のメトリクス用。なくてもコンソールはメトリクスなしで動く）
   - API キーを `deploy/cloud/secrets/datadog-api-key` に置く
   - アプリケーションキーは、スコープを `metrics_read` と `timeseries_query` だけにして作り、`deploy/cloud/secrets/datadog-app-key` に置く
   - `deploy/k8s/observability/datadog-values.yaml` を変えたので、Agent を入れ直す（cloud-dev・cloud-stg を監視から外し、cloud・cloud-apps のログを送る）

4. **SealedSecret** を作ってコミットする

   ```sh
   deploy/cloud/scripts/seal.sh prod
   deploy/cloud/scripts/seal.sh stg
   deploy/cloud/scripts/seal.sh dev
   ```

5. **アプリ用のリポジトリ**（ホスティングを使うとき。なくてもコンソールのほかの画面は動く）
   - GitHub に private の `JavaLangRuntimeException/taramanji-cloud-apps` を作り、`prod/`・`stg/`・`dev/` に空のファイル（`.gitkeep`）を置く
   - Argo CD が読む鍵: `deploy/cloud/scripts/seal-apps-repo.sh` の先頭の手順（Deploy key を読み取りだけで登録 → SealedSecret を apply）
   - コンソールが書くトークン: そのリポジトリだけ・Contents の Read and write だけの fine-grained PAT を `deploy/cloud/secrets/apps-repo-token` に置き、4 の `seal.sh` を実行し直す
   - 監視を使うなら、Datadog のアプリケーションキーのスコープに `monitors_read`・`monitors_write` を足し、
     `python3 deploy/cloudflare/uptime/datadog-webhook.py <Worker の URL> <トークンのファイル>` で Webhook を作り、Worker を `npx wrangler deploy` し直す

6. **リリース**: main にマージすると build が `taramanji-cloud`・`taramanji-console` を作り、cd が stg に出す。
   本番は今までどおり `v*` のタグで出る（それまで prod のイメージは `unreleased` で、Pod は起動しない）。

## CI / CD

- build: `backend/` の Go の変更で `cloud`、`console/` の変更で `console` のイメージを作る（`deploy/k8s/scripts/changed-services.py`）
- cd: PR → cloud-dev（dev は 1 つだけ。taramanji の dev01〜03 は選ばない）、main → cloud-stg、タグ → cloud（prod）。
  版を書き換えるのは `deploy/k8s/scripts/set-version.sh`（cloud・console は `deploy/cloud/overlays/` を書き換える）
- lint: 3 環境のマニフェストを kubeconform で確かめ、console の生成コード・型・lint を見る。test: console の vitest
