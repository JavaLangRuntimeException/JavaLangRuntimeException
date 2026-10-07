# taramanji.com on kind（GKE に寄せた構成）

```
利用者 ─ Cloudflare（DNS・TLS）─ Tunnel ─▶ cloudflared（ns: cloudflared, 2 Pod）
                                              │ http://taramanji-gateway.envoy-gateway-system
                                              ▼
                       Envoy Gateway（Gateway API。Service type=LoadBalancer）
     HTTPRoute site: taramanji.com / www / next  ─┬─ /taramanji.<svc>.v1.*  → 各 Go サービス（Connect）
                                                   ├─ /api/auth/*            → identity
                                                   ├─ /api/metrics/pageview  → analytics
                                                   └─ /                      → web（nginx + React）
     HTTPRoute gws: gws.taramanji.com             ─── /admin・ログイン・カレンダー同期だけ。他は taramanji.com へ 308
ns: taramanji  Go サービス 8 つ（各 2 Pod・PDB・ゾーン分散）+ web + CronJob（5 分ごとの同期）
               inquiry ─gRPC→ notification（内部専用） / reservation ─gRPC→ worklocation
ns: data       Redis StatefulSet（AOF・PVC standard-rwo・サービスごとの ACL と DB 番号）
ns: datadog    Datadog Agent（APM・DogStatsD・ログ・Envoy/Redis のチェック）
```

## 構成

| ディレクトリ | 中身 |
| --- | --- |
| `../kind/` | クラスター（コントロールプレーン 1 + ワーカー 2）、ローカルレジストリ、Envoy Gateway・metrics-server |
| `../gitops/` | Argo CD・Argo Rollouts・Sealed Secrets の導入（bootstrap.sh）と Argo CD のアプリ定義 |
| `base/apps` `base/data` `base/routes` `base/gateway` | 環境に依存しないマニフェスト（namespace とホスト名はオーバーレイで決める） |
| `overlays/prod/` | 本番（namespace: taramanji / data）。Argo Rollouts のカナリアと Datadog の自動判定、cloudflared |
| `overlays/dev/` | dev（namespace: taramanji-dev）。1 台ずつ・HPA/PDB なし・dev.taramanji.com |
| `overlays/gke/` | GKE に載せるときの差分（未適用） |
| `scripts/` | `make-secrets.sh`（平文を secrets/ に作る）・`seal.sh`（暗号化して sealed/ に）・`set-version.sh`（版の書き換え） |
| `observability/` | Datadog Agent の設定、ダッシュボード、モニター |

## リリースの流れ（GitOps）

| 環境 | 反映のきっかけ | URL |
| --- | --- | --- |
| dev | main への PR（同じリポジトリのブランチ）／手動実行 | dev.taramanji.com・dev-gws.taramanji.com |
| stg | main への push（マージ）／手動実行 | stg.taramanji.com・stg-gws.taramanji.com |
| prod | タグ `v*` の push | taramanji.com・gws.taramanji.com |

```
PR を出す・更新する ──▶ CI（Go / TS / マニフェスト / gitleaks）──▶ イメージを GHCR に push（sha-xxxxxxx、arm64 + amd64）
                     ──▶ overlays/dev の版を書き換えて main にコミット ──▶ Argo CD が dev に同期（PR ごとに dev が入れ替わる）
main にマージ        ──▶ 同じくイメージを push ──▶ overlays/stg を書き換え ──▶ Argo CD が stg に同期
stg で確認して git tag v1.2.3 <そのコミット> && git push origin v1.2.3
                     ──▶ release ワークフロー: イメージに v1.2.3 を付け、overlays/prod の版を書き換えてコミット
                     ──▶ Argo CD が prod に同期 ──▶ Argo Rollouts がカナリア
                         10%（5 分）→ 25%（5 分）→ 50%（5 分）→ 100%
                         その間ずっと Datadog で新しい版の 5xx 率（< 5%）と p95（< 3 秒、RunSync は除く）を判定し、2 回外れたら自動で元の版に戻す
手動実行             ──▶ GitHub の Actions → ci → Run workflow で、ブランチと dev / stg を選ぶ
```

```bash
# カナリアの様子
kubectl argo rollouts --context kind-taramanji -n taramanji get rollout reservation --watch
# 途中で止める・すぐ全部に出す・中止して戻す
kubectl argo rollouts --context kind-taramanji -n taramanji pause reservation
kubectl argo rollouts --context kind-taramanji -n taramanji promote reservation --full
kubectl argo rollouts --context kind-taramanji -n taramanji abort reservation
# 前の版に戻す（Git が正）: 版を書き換えたコミットを revert するか、前のタグでもう一度リリースする
deploy/k8s/scripts/set-version.sh prod v1.2.2 && git commit -am "deploy(prod): rollback to v1.2.2" && git push

# Argo Rollouts の画面: https://rollouts.taramanji.com（Cloudflare Access で管理者だけ）。Promote / Abort をボタンで

# Argo CD の画面
kubectl --context kind-taramanji -n argocd port-forward svc/argocd-server 8080:80   # http://localhost:8080
```

## Secret

Git（public）には暗号化した SealedSecret だけを置く。平文は `secrets/<env>/`（git に入らない）。

```bash
deploy/k8s/scripts/make-secrets.sh dev     # 平文を作る / 作り直す（パスワードは前回の値を使い回す）
deploy/k8s/scripts/seal.sh dev             # overlays/dev/sealed/ に暗号化して書く → コミット
```

Secret を変えたら Pod を作り直す（`kubectl rollout restart` / Rollout は `kubectl argo rollouts restart`）。

## dev 環境

- https://dev.taramanji.com と https://dev-gws.taramanji.com（staging トンネル経由）。Cloudflare Access で本人だけに制限する
- データは dev 専用の Redis（同じ namespace）。カレンダー同期の CronJob は止めてある（実在のカレンダーを書き換えないため）
- 予約・お問い合わせは本物の GAS・SES に届くので、試すときは自分宛てに

## よく使う操作

```bash
kubectl --context kind-taramanji -n taramanji get pods -o wide
kubectl --context kind-taramanji get gateway,httproute -A
kubectl --context kind-taramanji -n taramanji get hpa,pdb,rollout
kubectl --context kind-taramanji -n taramanji logs deploy/reservation --tail=50   # JSON。trace_id で Datadog のトレースへ

# ワーカーを 1 台止めてもサイトが止まらないことの確認
kubectl --context kind-taramanji drain taramanji-worker --ignore-daemonsets --delete-emptydir-data
kubectl --context kind-taramanji uncordon taramanji-worker

python3 deploy/k8s/observability/dashboard.py
python3 deploy/k8s/observability/monitors.py
```

## モニターが鳴ったら

| モニター | まず見るところ |
| --- | --- |
| Gateway の 5xx 率 | ダッシュボードの「ステータスクラス別」→ 上流（envoy_cluster_name）→ APM のエラーのトレース |
| p95 レイテンシ | 「遅い RPC」→ トレースの外部呼び出し（GAS・Qiita・Google） |
| 再起動を繰り返す / Ready が足りない | `kubectl describe pod`（OOMKilled・probe 失敗）、`kubectl logs --previous` |
| トンネルの接続が減った | `kubectl -n cloudflared logs deploy/cloudflared`、Mac mini のネットワーク |
| Redis のメモリ | `redis-cli --user admin INFO memory`、キャッシュ（`content:*`）の量 |
| カレンダー同期の失敗・停止・要再接続 | gws.taramanji.com/admin の前回の結果、CronJob `calendarsync-run` の Job のログ |
| 予約の作成失敗 | `reservation.created{status:failed}` の reason タグ、GAS のデプロイ |
| メール送信の失敗 | notification のログ、SES の送信制限・認証情報 |

## データ

- Redis: `kubectl --context kind-taramanji -n data exec -it redis-0 -- redis-cli --user admin --pass <deploy/k8s/secrets/prod/generated.env の REDIS_PASSWORD_ADMIN>`
- DB 番号: 0 = worklocation、1 = content（キャッシュ）、2 = calendarsync
- PV は Mac の `~/taramanji-data/worker*` にあり、クラスターを作り直しても残る（StorageClass は Retain）
- 旧構成からの移行: `backend/cmd/migrate-legacy`（`-apply` なしは確認だけ、`-verify-sync` は同期が書き込む件数を読むだけで確かめる）
