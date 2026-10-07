#!/usr/bin/env python3
"""
Datadog のモニターと SLO を作る / 更新する（名前が同じものは上書き）。

  python3 deploy/k8s/observability/monitors.py            # 通知先なし（状態だけ変わる）
  NOTIFY="@slack-xxx" python3 deploy/k8s/observability/monitors.py   # 通知先を付ける

実務でよく置くもの: 入口の 5xx 率・レイテンシ悪化・Pod の CrashLoop/準備不足・依存先（Redis・トンネル）・業務の失敗、
それとサイトの可用性 SLO（Envoy の 5xx 以外の割合）。
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from dashboard import CLUSTER, call, keys  # noqa: E402

NOTIFY = os.environ.get("NOTIFY", "")
TAGS = ["app:taramanji", "managed-by:monitors.py", "env:prod"]


def msg(text):
    return f"{text}\n\nRunbook: deploy/k8s/README.md\n{NOTIFY}".strip()


MONITORS = [
    {
        "name": "[taramanji] Gateway の 5xx 率が高い",
        "type": "query alert",
        "query": f"sum(last_10m):100 * sum:envoy.cluster.upstream_rq.count{{{CLUSTER},envoy_response_code_class:5}}.as_count() / "
                 f"sum:envoy.cluster.upstream_rq.count{{{CLUSTER}}}.as_count() > 5",
        "message": msg("Envoy Gateway から各サービスへのリクエストの 5xx が {{value}}% です。APM のエラーと Pod の状態を確認してください。"),
        "options": {"thresholds": {"critical": 5, "warning": 2}, "require_full_window": False, "notify_no_data": False,
                    "evaluation_delay": 60},
    },
    {
        "name": "[taramanji] {{service.name}} の p95 レイテンシが悪化",
        "type": "query alert",
        "query": "percentile(last_15m):p95:trace.http.server.request{env:prod AND service IN "
                 "(identity,inquiry,reservation,worklocation,content,analytics)} by {service} > 3",
        "message": msg("{{service.name}} の p95 が {{value}} 秒です（外部 API の遅れ・GAS の応答を確認）。"),
        "options": {"thresholds": {"critical": 3, "warning": 1.5}, "require_full_window": False},
    },
    {
        "name": "[taramanji] {{kube_deployment.name}} のコンテナが再起動を繰り返している",
        "type": "query alert",
        "query": f"change(sum(last_15m),last_15m):sum:kubernetes_state.container.restarts{{{CLUSTER}}} by {{kube_deployment}} > 3",
        "message": msg("{{kube_deployment.name}} が 15 分で {{value}} 回再起動しました（CrashLoopBackOff・OOMKilled を確認）。"),
        "options": {"thresholds": {"critical": 3}, "notify_no_data": False},
    },
    {
        "name": "[taramanji] {{kube_deployment.name}} の Ready な Pod が足りない",
        "type": "query alert",
        "query": f"min(last_10m):sum:kubernetes_state.deployment.replicas_available{{{CLUSTER},kube_namespace:taramanji}} by {{kube_deployment}} < 1",
        "message": msg("{{kube_deployment.name}} の利用可能な Pod が 0 です。"),
        "options": {"thresholds": {"critical": 1}, "notify_no_data": True, "no_data_timeframe": 20},
    },
    {
        "name": "[taramanji] Cloudflare Tunnel の接続が減った",
        "type": "query alert",
        "query": "min(last_5m):sum:cloudflared.cloudflared_tunnel_ha_connections{kube_cluster_name:taramanji-kind} < 4",
        "message": msg("トンネルの接続数が {{value}} です（正常は 8: 2 Pod × 4 本）。0 ならサイトが見えません。"),
        "options": {"thresholds": {"critical": 4, "warning": 6}, "notify_no_data": True, "no_data_timeframe": 10},
    },
    {
        "name": "[taramanji] Redis のメモリが上限に近い",
        "type": "query alert",
        "query": f"avg(last_10m):100 * max:redis.mem.used{{{CLUSTER}}} / max:redis.mem.maxmemory{{{CLUSTER}}} > 80",
        "message": msg("Redis のメモリが maxmemory の {{value}}% です（noeviction なので満杯になると書き込みが失敗します）。"),
        "options": {"thresholds": {"critical": 80, "warning": 65}},
    },
    {
        "name": "[taramanji] カレンダー同期が失敗している",
        "type": "query alert",
        "query": "sum(last_30m):sum:calendar_sync.run{status:error}.as_count() + sum:calendar_sync.run{status:failed}.as_count() >= 3",
        "message": msg("カレンダー同期が 30 分で {{value}} 回失敗しました。gws.taramanji.com/admin の前回の結果を確認してください。"),
        "options": {"thresholds": {"critical": 3}, "notify_no_data": False},
    },
    {
        "name": "[taramanji] カレンダー同期: 再接続が必要なアカウントがある",
        "type": "query alert",
        "query": "max(last_15m):max:calendar_sync.accounts.reconnect_needed{*} > 0",
        "message": msg("{{value}} 件のアカウントの更新トークンが失効しています。gws.taramanji.com/admin から再接続してください。"),
        "options": {"thresholds": {"critical": 0}},
    },
    {
        "name": "[taramanji] カレンダー同期が止まっている",
        "type": "query alert",
        "query": "sum(last_30m):sum:calendar_sync.run{*}.as_count() < 1",
        "message": msg("30 分間カレンダー同期が実行されていません（CronJob calendarsync-run を確認）。"),
        "options": {"thresholds": {"critical": 1}, "notify_no_data": True, "no_data_timeframe": 30},
    },
    {
        "name": "[taramanji] 予約の作成に失敗している",
        "type": "query alert",
        "query": "sum(last_1h):sum:reservation.created{status:failed}.as_count() >= 2",
        "message": msg("予約の作成が 1 時間で {{value}} 回失敗しました（GAS ウェブフックの応答・reason タグを確認）。"),
        "options": {"thresholds": {"critical": 2}, "notify_no_data": False},
    },
    {
        "name": "[taramanji] メール送信に失敗している",
        "type": "query alert",
        "query": "sum(last_1h):sum:email.sent{status:failed}.as_count() >= 1",
        "message": msg("SES でのメール送信が {{value}} 回失敗しました（お問い合わせが届いていない可能性）。"),
        "options": {"thresholds": {"critical": 1}, "notify_no_data": False},
    },    {
        "name": "[taramanji] {{instance.name}} に外からつながらない",
        "type": "service check",
        "query": '"http.can_connect".over("*").by("instance").last(3).count_by_status()',
        "message": msg("HTTP Check（Cloudflare 経由）で {{instance.name}} に 3 回続けてつながりません。cloudflared・Envoy Gateway・web を確認してください。"),
        "options": {"thresholds": {"critical": 3, "ok": 1}, "notify_no_data": True, "no_data_timeframe": 10},
    },
    {
        "name": "[taramanji] TLS 証明書の期限が近い",
        "type": "query alert",
        "query": "min(last_1h):min:http.ssl.days_left{*} by {instance} < 14",
        "message": msg("{{instance.name}} の証明書の残りが {{value}} 日です（Cloudflare の Edge 証明書を確認）。"),
        "options": {"thresholds": {"critical": 14, "warning": 21}, "notify_no_data": False},
    },
    {
        "name": "[taramanji] Argo CD: {{name.name}} が Healthy でない",
        "type": "query alert",
        "query": "max(last_15m):sum:argocd.app_controller.app.info{health_status:degraded} by {name} + "
                 "sum:argocd.app_controller.app.info{health_status:missing} by {name} >= 1",
        "message": msg("Argo CD の Application {{name.name}} が Degraded / Missing です（argocd app get で確認）。"),
        "options": {"thresholds": {"critical": 1}, "notify_no_data": False},
    },
    {
        "name": "[taramanji] Argo Rollouts: {{argo_rollouts_name.name}} が中止・失敗した",
        "type": "query alert",
        "query": "max(last_5m):sum:argo_rollouts.rollout.phase{phase:abort} by {argo_rollouts_name} + "
                 "sum:argo_rollouts.rollout.phase{phase:error} by {argo_rollouts_name} >= 1",
        "message": msg("Rollout {{argo_rollouts_name.name}} が Abort / Error です（分析の失敗など。kubectl argo rollouts get rollout で確認）。"),
        "options": {"thresholds": {"critical": 1}, "notify_no_data": False},
    },
]

SLO = {
    "name": "[taramanji] サイトの可用性",
    "type": "metric",
    "description": "Envoy Gateway を通ったリクエストのうち 5xx でない割合。deploy/k8s/observability/monitors.py で管理",
    "query": {
        "numerator": f"sum:envoy.cluster.upstream_rq.count{{{CLUSTER}}}.as_count() - sum:envoy.cluster.upstream_rq.count{{{CLUSTER},envoy_response_code_class:5}}.as_count()",
        "denominator": f"sum:envoy.cluster.upstream_rq.count{{{CLUSTER}}}.as_count()",
    },
    "thresholds": [{"timeframe": "30d", "target": 99.5, "warning": 99.8}, {"timeframe": "7d", "target": 99.5}],
    "tags": TAGS,
}


def main():
    k = keys()
    existing = {m["name"]: m["id"] for m in call("GET", "/api/v1/monitor?monitor_tags=managed-by:monitors.py", k)}
    for m in MONITORS:
        body = {**m, "tags": TAGS}
        if m["name"] in existing:
            call("PUT", f"/api/v1/monitor/{existing[m['name']]}", k, body)
            print("更新:", m["name"])
        else:
            call("POST", "/api/v1/monitor", k, body)
            print("作成:", m["name"])
    slos = {s["name"]: s["id"] for s in call("GET", "/api/v1/slo?tags_query=managed-by:monitors.py", k).get("data") or []}
    if SLO["name"] in slos:
        call("PUT", f"/api/v1/slo/{slos[SLO['name']]}", k, SLO)
        print("更新:", SLO["name"])
    else:
        call("POST", "/api/v1/slo", k, SLO)
        print("作成:", SLO["name"])


if __name__ == "__main__":
    main()
