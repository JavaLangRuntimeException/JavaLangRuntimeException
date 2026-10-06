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
| `base/` | 共通のマニフェスト（namespace・Redis・アプリ・Gateway・HPA・PDB・NetworkPolicy） |
| `overlays/kind/` | 本番（Mac mini）。`make-secrets.sh`・`deploy.sh`・cloudflared |
| `overlays/gke/` | GKE に載せるときの差分（未適用） |
| `observability/` | Datadog Agent の設定、ダッシュボード、モニター |

## よく使う操作

```bash
# デプロイ（イメージをビルドして push → 適用 → ロールアウト待ち）
deploy/k8s/overlays/kind/deploy.sh
# マニフェストだけ
SKIP_BUILD=1 deploy/k8s/overlays/kind/deploy.sh

# 状態
kubectl --context kind-taramanji -n taramanji get pods -o wide
kubectl --context kind-taramanji get gateway,httproute -A
kubectl --context kind-taramanji -n taramanji get hpa,pdb

# ログ（JSON。trace_id で Datadog のトレースとつながる）
kubectl --context kind-taramanji -n taramanji logs deploy/reservation --tail=50

# ロールバック
kubectl --context kind-taramanji -n taramanji rollout undo deploy/<name>

# ワーカーを 1 台止めてもサイトが止まらないことの確認
kubectl --context kind-taramanji drain taramanji-worker --ignore-daemonsets --delete-emptydir-data
kubectl --context kind-taramanji uncordon taramanji-worker

# Datadog
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

- Redis: `kubectl --context kind-taramanji -n data exec -it redis-0 -- redis-cli --user admin --pass <secrets/generated.env の REDIS_PASSWORD_ADMIN>`
- DB 番号: 0 = worklocation、1 = content（キャッシュ）、2 = calendarsync
- PV は Mac の `~/taramanji-data/worker*` にあり、クラスターを作り直しても残る（StorageClass は Retain）
- 旧構成からの移行: `backend/cmd/migrate-legacy`（`-apply` なしは確認だけ、`-verify-sync` は同期が書き込む件数を読むだけで確かめる）
