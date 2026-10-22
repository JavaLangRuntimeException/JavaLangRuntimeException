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
- **権限**: cloud-api の ServiceAccount は自分の名前空間の Deployment・StatefulSet を読めるだけ

## 構成

```
deploy/cloud/
  platform/        全環境で 1 つ（prod の Application が持つ）: 名前空間・Gateway（cloud）・トンネル（cloudflared）
  base/            1 環境ぶん: cloud-api（Go、backend/cmd/cloud）・console（console/ の画面）・HTTPRoute・NetworkPolicy
  overlays/
    prod/          platform + app（base）+ sealed
    stg/ dev/      base + sealed（ホスト名・環境名だけ変える）
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
   - `deploy/k8s/observability/datadog-values.yaml` を変えたので、Agent を入れ直す（cloud-dev・cloud-stg を監視から外し、cloud のログを送る）

4. **SealedSecret** を作ってコミットする

   ```sh
   deploy/cloud/scripts/seal.sh prod
   deploy/cloud/scripts/seal.sh stg
   deploy/cloud/scripts/seal.sh dev
   ```

5. **リリース**: main にマージすると build が `taramanji-cloud`・`taramanji-console` を作り、cd が stg に出す。
   本番は今までどおり `v*` のタグで出る（それまで prod のイメージは `unreleased` で、Pod は起動しない）。

## CI / CD

- build: `backend/` の Go の変更で `cloud`、`console/` の変更で `console` のイメージを作る（`deploy/k8s/scripts/changed-services.py`）
- cd: PR → cloud-dev（dev は 1 つだけ。taramanji の dev01〜03 は選ばない）、main → cloud-stg、タグ → cloud（prod）。
  版を書き換えるのは `deploy/k8s/scripts/set-version.sh`（cloud・console は `deploy/cloud/overlays/` を書き換える）
- lint: 3 環境のマニフェストを kubeconform で確かめ、console の生成コード・型・lint を見る。test: console の vitest
