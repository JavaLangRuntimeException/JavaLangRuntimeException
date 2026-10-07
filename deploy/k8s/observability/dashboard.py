#!/usr/bin/env python3
"""
Datadog に「taramanji.com — kind (GKE-style)」ダッシュボードを作る / 更新する（同じタイトルがあれば上書き）。
実務で見る順に並べる: 外形監視 → 入口（cloudflared・Envoy・nginx）→ 各サービス（APM・Go）→ 依存先（Redis・外部 API）→ 業務 → 基盤（k8s・Argo）。

  python3 deploy/k8s/observability/dashboard.py

キーは deploy/k8s/secrets/prod/datadog-api-key と datadog-app-key（git に入らない。seal.sh と同じファイル）から読む。
標準ライブラリだけで動く。
"""
import json
import os
import sys
import urllib.error
import urllib.request

SITE = "us5.datadoghq.com"
API = f"https://api.{SITE}"
TITLE = "taramanji.com — kind (GKE-style)"
CLUSTER = "kube_cluster_name:taramanji-kind"
APP_NS = "kube_namespace:taramanji"
SERVICES = ["identity", "inquiry", "reservation", "worklocation", "content", "calendarsync", "analytics", "notification"]


SECRETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "secrets", "prod")


def secret(name):
    path = os.path.join(SECRETS, name)
    if not os.path.exists(path):
        sys.exit(f"{os.path.normpath(path)} がありません（Datadog のキーを置いてください）")
    return open(path).read().strip()


def keys():
    return secret("datadog-api-key"), secret("datadog-app-key")


def call(method, path, k, body=None):
    req = urllib.request.Request(API + path, method=method, data=None if body is None else json.dumps(body).encode(),
                                 headers={"DD-API-KEY": k[0], "DD-APPLICATION-KEY": k[1], "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return json.load(res)
    except urllib.error.HTTPError as e:
        sys.exit(f"Datadog API {method} {path}: HTTP {e.code} {e.read().decode()[:800]}")


# ---------- ウィジェット ----------
def ts(title, queries, display="line", formulas=None, unit=None):
    req = {
        "queries": [{"data_source": "metrics", "name": f"q{i}", "query": q} for i, q in enumerate(queries)],
        "formulas": formulas or [{"formula": f"q{i}"} for i in range(len(queries))],
        "display_type": display,
        "response_format": "timeseries",
    }
    d = {"type": "timeseries", "title": title, "show_legend": True, "requests": [req]}
    if unit:
        d["yaxis"] = {"label": unit}
    return {"definition": d}


def value(title, query, aggregator="last", formula="q0", precision=0, suffix=None):
    d = {"type": "query_value", "title": title, "precision": precision, "autoscale": True,
         "requests": [{"queries": [{"data_source": "metrics", "name": "q0", "query": query, "aggregator": aggregator}],
                       "formulas": [{"formula": formula}], "response_format": "scalar"}]}
    if suffix:
        d["custom_unit"] = suffix
    return {"definition": d}


def ratio(title, num, den, suffix="%"):
    return {"definition": {
        "type": "query_value", "title": title, "precision": 2, "custom_unit": suffix,
        "requests": [{"queries": [
            {"data_source": "metrics", "name": "a", "query": num, "aggregator": "sum"},
            {"data_source": "metrics", "name": "b", "query": den, "aggregator": "sum"}],
            "formulas": [{"formula": "100 * a / b"}], "response_format": "scalar"}],
    }}


def toplist(title, query, aggregator="sum"):
    return {"definition": {
        "type": "toplist", "title": title,
        "requests": [{"queries": [{"data_source": "metrics", "name": "q0", "query": query, "aggregator": aggregator}],
                      "formulas": [{"formula": "q0", "limit": {"count": 10, "order": "desc"}}], "response_format": "scalar"}],
    }}


def note(text):
    return {"definition": {"type": "note", "content": text, "background_color": "white", "font_size": "14", "show_tick": False}}


def group(title, widgets, color="vivid_blue"):
    return {"definition": {"type": "group", "title": title, "layout_type": "ordered", "background_color": color, "widgets": widgets}}


def events(title, query):
    return {"definition": {"type": "list_stream", "title": title, "requests": [{
        "query": {"data_source": "event_stream", "query_string": query, "event_size": "s"},
        "columns": [{"field": "stream", "width": "auto"}], "response_format": "event_list"}]}}


def service_map():
    return {"definition": {"type": "servicemap", "title": "サービスマップ（APM）", "service": "reservation",
                           "filters": ["env:prod"]}}


def dashboard():
    http = "trace.http.server.request"
    svc_filter = "env:prod AND service IN (" + ",".join(SERVICES) + ") AND $service"
    return {
        "title": TITLE,
        "description": "Mac mini の kind（GKE に寄せた構成）で動く taramanji.com。deploy/k8s/observability/dashboard.py で生成",
        "layout_type": "ordered",
        "template_variables": [{"name": "service", "prefix": "service", "available_values": SERVICES, "default": "*"}],
        "widgets": [
            group("HTTP Check", [
                value("taramanji.com", "min:network.http.can_connect{instance:taramanji.com}", "last"),
                value("gws.taramanji.com", "min:network.http.can_connect{instance:gws.taramanji.com}", "last"),
                value("証明書の残り日数", "min:http.ssl.days_left{*}", "last"),
                ts("応答時間（秒）", ["avg:network.http.response_time{*} by {url}"]),
                ts("接続失敗", ["sum:network.http.cant_connect{*} by {url}"], "bars"),
            ], "vivid_blue"),
            group("cloudflared", [
                value("トンネルの接続数", "sum:cloudflared.cloudflared_tunnel_ha_connections{*}"),
                ts("リクエスト数", ["sum:cloudflared.cloudflared_tunnel_total_requests.count{*}.as_count()",
                                  "sum:cloudflared.cloudflared_tunnel_request_errors.count{*}.as_count()"], "bars",
                   [{"formula": "q0", "alias": "リクエスト"}, {"formula": "q1", "alias": "エラー"}]),
                ts("ステータスコード別", ["sum:cloudflared.cloudflared_tunnel_response_by_code.count{*} by {status_code}.as_count()"], "bars"),
                ts("同時リクエスト", ["max:cloudflared.cloudflared_tunnel_concurrent_requests_per_tunnel{*}"]),
                ts("トンネルの接続数", ["sum:cloudflared.cloudflared_tunnel_ha_connections{*}"]),
            ], "vivid_orange"),
            group("Envoy Gateway", [
                ratio("5xx の割合（直近）", "sum:envoy.cluster.upstream_rq.count{" + CLUSTER + ",envoy_response_code_class:5}.as_count()",
                      "sum:envoy.cluster.upstream_rq.count{" + CLUSTER + "}.as_count()"),
                value("リクエスト/秒", "sum:envoy.cluster.upstream_rq.count{" + CLUSTER + "}.as_rate()", "avg", precision=2),
                value("アクティブなリクエスト", "sum:envoy.cluster.upstream_rq_active{" + CLUSTER + "}"),
                ts("リクエスト数（上流サービス別）", ["sum:envoy.cluster.upstream_rq.count{" + CLUSTER + "} by {envoy_cluster_name}.as_count()"], "bars"),
                ts("ステータスクラス別", ["sum:envoy.cluster.upstream_rq.count{" + CLUSTER + "} by {envoy_response_code_class}.as_count()"], "bars"),
                ts("上流への接続失敗・タイムアウト", [
                    "sum:envoy.cluster.upstream_cx_connect_fail.count{" + CLUSTER + "}.as_count()",
                    "sum:envoy.cluster.upstream_rq_timeout.count{" + CLUSTER + "}.as_count()"], "bars",
                   [{"formula": "q0", "alias": "接続失敗"}, {"formula": "q1", "alias": "タイムアウト"}]),
            ], "vivid_blue"),
            group("nginx", [
                ts("リクエスト/秒", [f"sum:nginx.net.request_per_s{{{APP_NS}}}"]),
                ts("接続（active / reading / writing / waiting）", [
                    f"sum:nginx.net.connections{{{APP_NS}}}", f"sum:nginx.net.reading{{{APP_NS}}}",
                    f"sum:nginx.net.writing{{{APP_NS}}}", f"sum:nginx.net.waiting{{{APP_NS}}}"],
                   formulas=[{"formula": "q0", "alias": "active"}, {"formula": "q1", "alias": "reading"},
                             {"formula": "q2", "alias": "writing"}, {"formula": "q3", "alias": "waiting"}]),
                ts("接続の受付・取りこぼし", [f"sum:nginx.net.conn_opened_per_s{{{APP_NS}}}", f"sum:nginx.net.conn_dropped_per_s{{{APP_NS}}}"],
                   formulas=[{"formula": "q0", "alias": "opened/s"}, {"formula": "q1", "alias": "dropped/s"}]),
            ], "vivid_blue"),
            group("APM", [
                service_map(),
                ts("リクエスト数（サービス別）", [f"sum:{http}.hits{{{svc_filter}}} by {{service}}.as_count()"], "bars"),
                ts("エラー数（サービス別）", [f"sum:{http}.errors{{{svc_filter}}} by {{service}}.as_count()"], "bars"),
                ts("p95 レイテンシ（サービス別, 秒）", [f"p95:{http}{{{svc_filter}}} by {{service}}"]),
                ts("p99 レイテンシ（サービス別, 秒）", [f"p99:{http}{{{svc_filter}}} by {{service}}"]),
                toplist("遅い RPC（p95）", f"p95:{http}{{{svc_filter}}} by {{service,resource_name}}", "avg"),
                toplist("エラーの多い RPC", f"sum:{http}.errors{{{svc_filter}}} by {{service,resource_name}}.as_count()"),
                ts("Apdex", [f"avg:{http}.apdex{{{svc_filter}}} by {{service}}"]),
            ], "vivid_purple"),
            group("Go Runtime", [
                ts("goroutine 数", ["avg:runtime.go.num_goroutine{env:prod,$service} by {service}"]),
                ts("ヒープ（bytes）", ["avg:runtime.go.mem_stats.heap_alloc{env:prod,$service} by {service}"]),
                ts("GC 停止時間 p75（秒）", ["max:runtime.go.gc_stats.pause_quantiles.75p{env:prod,$service} by {service}"]),
            ], "gray"),
            group("External API", [
                ts("外部 API のレイテンシ（content: Qiita / connpass / ORCID / OGP, ms）",
                   ["avg:content.external.duration.avg{*} by {source}", "max:content.external.duration.95percentile{*} by {source}"]),
                ts("外部 API の失敗（content）", ["sum:content.external.requests{status:error} by {source}.as_count()"], "bars"),
                ts("予約の外部呼び出し（GAS / Google Calendar, ms）",
                   ["avg:reservation.calendar.latency.avg{*} by {via,op}", "max:reservation.calendar.latency.95percentile{*} by {via,op}"]),
                ts("iCal の取得（ms）", ["max:reservation.ical.latency.95percentile{*} by {source,status}"]),
            ], "vivid_orange"),
            group("Redis", [
                ts("Redis コマンド p95（APM, 秒）", ["p95:trace.redis.command{env:prod} by {service}"]),
                ts("Redis メモリ", [f"max:redis.mem.used{{{CLUSTER}}}", f"max:redis.mem.maxmemory{{{CLUSTER}}}"]),
                ts("Redis 接続数", [f"max:redis.net.clients{{{CLUSTER}}}"]),
                ts("ops/秒", [f"sum:redis.net.instantaneous_ops_per_sec{{{CLUSTER}}} by {{kube_namespace}}"]),
                ts("キー数", [f"sum:redis.keys{{{CLUSTER}}} by {{kube_namespace}}"]),
                ts("キャッシュヒット率（%）", [f"sum:redis.stats.keyspace_hits{{{CLUSTER}}}", f"sum:redis.stats.keyspace_misses{{{CLUSTER}}}"],
                   formulas=[{"formula": "100 * q0 / (q0 + q1)"}]),
            ], "orange"),
            group("DogStatsD", [
                value("予約（期間内）", "sum:reservation.created{status:ok}.as_count()", "sum"),
                value("予約の失敗", "sum:reservation.created{status:failed}.as_count()", "sum"),
                value("お問い合わせ", "sum:inquiry.contact{status:ok}.as_count()", "sum"),
                value("ページビュー", "sum:web.pageviews{*}.as_count()", "sum"),
                ts("予約（作成・失敗・取消・受付外）", [
                    "sum:reservation.created{status:ok}.as_count()", "sum:reservation.created{status:failed}.as_count()",
                    "sum:reservation.cancelled{status:ok}.as_count()", "sum:reservation.rejected{*}.as_count()"], "bars",
                   [{"formula": "q0", "alias": "作成"}, {"formula": "q1", "alias": "失敗"}, {"formula": "q2", "alias": "取消"}, {"formula": "q3", "alias": "受付外"}]),
                toplist("予約の目的", "sum:reservation.created{status:ok} by {purpose}.as_count()"),
                ts("メール送信（SES）", ["sum:email.sent{*} by {status}.as_count()"], "bars"),
                ts("お問い合わせ・アンケート", ["sum:inquiry.contact{*} by {status}.as_count()", "sum:inquiry.questionnaire{*} by {status}.as_count()"], "bars"),
                toplist("よく見られているページ", "sum:web.pageviews{*} by {page}.as_count()"),
                ts("管理者ログイン", ["sum:identity.login{*} by {status}.as_count()"], "bars"),
            ], "vivid_green"),
            group("calendarsync", [
                value("同期中の予定", "max:calendar_sync.mirrors{*}"),
                value("接続アカウント", "max:calendar_sync.accounts{*}"),
                value("要再接続", "max:calendar_sync.accounts.reconnect_needed{*}"),
                ts("書き込み・削除", ["sum:calendar_sync.writes{*}.as_count()", "sum:calendar_sync.deletes{*}.as_count()"], "bars",
                   [{"formula": "q0", "alias": "書き込み"}, {"formula": "q1", "alias": "削除"}]),
                ts("1 回の同期の時間（ms）", ["avg:calendar_sync.run.duration_ms.avg{*}", "max:calendar_sync.run.duration_ms.95percentile{*}"],
                   formulas=[{"formula": "q0", "alias": "平均"}, {"formula": "q1", "alias": "p95"}]),
                ts("実行結果", ["sum:calendar_sync.run{*} by {status}.as_count()"], "bars"),
            ], "vivid_yellow"),
            group("Kubernetes", [
                value("Ready の Pod", f"sum:kubernetes_state.pod.ready{{{CLUSTER},condition:true}}"),
                ts("CPU（デプロイ別, millicores）", [f"sum:container.cpu.usage{{{CLUSTER},{APP_NS}}} by {{kube_deployment}}"],
                   formulas=[{"formula": "q0 / 1000000"}]),
                ts("メモリ（デプロイ別）", [f"sum:container.memory.usage{{{CLUSTER},{APP_NS}}} by {{kube_deployment}}"]),
                ts("コンテナの再起動", [f"sum:kubernetes_state.container.restarts{{{CLUSTER}}} by {{kube_deployment}}"], "bars"),
                ts("HPA のレプリカ数（現在 / 希望）", [
                    f"max:kubernetes_state.hpa.current_replicas{{{CLUSTER}}} by {{horizontalpodautoscaler}}",
                    f"max:kubernetes_state.hpa.desired_replicas{{{CLUSTER}}} by {{horizontalpodautoscaler}}"]),
                ts("PDB: 止められる Pod の数", [f"min:kubernetes_state.pdb.disruptions_allowed{{{CLUSTER}}} by {{kube_namespace,poddisruptionbudget}}"]),
                ts("ノードの CPU（%）", [f"avg:system.cpu.user{{{CLUSTER}}} by {{host}}"]),
                events("Kubernetes Events", "source:kubernetes"),
            ], "gray"),
            group("Argo CD", [
                toplist("Application（sync / health）", "max:argocd.app_controller.app.info{*} by {name,sync_status,health_status}", "last"),
                ts("Sync（結果別）", ["sum:argocd.app_controller.app.sync.count{*} by {name,phase}.as_count()"], "bars"),
                ts("Reconcile 時間 p95（秒）", ["p95:argocd.app_controller.app.reconcile{*} by {name}"]),
                ts("git fetch / ls-remote", ["sum:argocd.repo_server.git.request.count{*} by {request_type}.as_count()"], "bars"),
                ts("git にかかった時間（平均, 秒）", ["sum:argocd.repo_server.git.request.duration.seconds.sum{*}.as_count()",
                                                "sum:argocd.repo_server.git.request.duration.seconds.count{*}.as_count()"],
                   formulas=[{"formula": "q0 / q1"}]),
                ts("workqueue の深さ", ["max:argocd.app_controller.workqueue.depth{*} by {name}"]),
            ], "vivid_purple"),
            group("Argo Rollouts", [
                toplist("Rollout の状態", "max:argo_rollouts.rollout.phase{*} by {argo_rollouts_name,phase}", "last"),
                ts("レプリカ（available / desired）", [
                    "sum:argo_rollouts.rollout.info.replicas.available{*} by {argo_rollouts_name}",
                    "sum:argo_rollouts.rollout.info.replicas.desired{*} by {argo_rollouts_name}"]),
                ts("AnalysisRun（結果別）", ["sum:argo_rollouts.analysis.run.phase{*} by {phase}"], "bars"),
                ts("Rollout のイベント", ["sum:argo_rollouts.rollout.events.count{*} by {argo_rollouts_name,reason}.as_count()"], "bars"),
            ], "vivid_pink"),
            group("Logs", [
                {"definition": {"type": "log_stream", "title": "エラーログ（全サービス）",
                                "query": f"{CLUSTER} status:error",
                                "columns": ["host", "service"], "indexes": [], "message_display": "expanded-md",
                                "sort": {"column": "time", "order": "desc"}}},
            ], "pink"),
        ],
    }


def main():
    k = keys()
    body = dashboard()
    existing = [d for d in call("GET", "/api/v1/dashboard", k).get("dashboards", []) if d.get("title") == TITLE]
    if existing:
        result = call("PUT", f"/api/v1/dashboard/{existing[0]['id']}", k, body)
        print("更新しました")
    else:
        result = call("POST", "/api/v1/dashboard", k, body)
        print("作成しました")
    print(f"https://{SITE}{result['url']}")


if __name__ == "__main__":
    main()
