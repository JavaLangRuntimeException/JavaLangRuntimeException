#!/usr/bin/env python3
"""
Datadog に「taramanji.com — kind (GKE-style)」ダッシュボードを作る / 更新する（同じタイトルがあれば上書き）。
実務で見る順に並べる: 利用者から見た状態（RED）→ 入口（Envoy）→ 各サービス（APM・Go ランタイム）→ 依存先（Redis・外部 API）→ 業務 → 基盤（k8s）。

  python3 deploy/k8s/observability/dashboard.py

キーはクラスターの Secret から読む（API キー: kind の datadog/datadog-secret、Application Key: datadog/datadog-app-key。
kind に無ければ旧 OrbStack から読む）。標準ライブラリだけで動く。
"""
import base64
import json
import subprocess
import sys
import urllib.error
import urllib.request

SITE = "us5.datadoghq.com"
API = f"https://api.{SITE}"
TITLE = "taramanji.com — kind (GKE-style)"
CLUSTER = "kube_cluster_name:taramanji-kind"
APP_NS = "kube_namespace:taramanji"
SERVICES = ["identity", "inquiry", "reservation", "worklocation", "content", "calendarsync", "analytics", "notification"]


def secret(name, key):
    for ctx in ("kind-taramanji", "orbstack"):
        r = subprocess.run(["kubectl", "--context", ctx, "-n", "datadog", "get", "secret", name, "-o", f"jsonpath={{.data.{key}}}"],
                           capture_output=True, text=True)
        if r.returncode == 0 and r.stdout:
            return base64.b64decode(r.stdout).decode().strip()
    sys.exit(f"Secret datadog/{name} が見つかりません")


def keys():
    return secret("datadog-secret", "api-key"), secret("datadog-app-key", "app-key")


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


def service_map():
    return {"definition": {"type": "servicemap", "title": "サービスマップ（APM）", "service": "reservation",
                           "filters": ["env:prod"]}}


def dashboard():
    http = "trace.http.request"
    svc_filter = "env:prod AND service IN (" + ",".join(SERVICES) + ") AND $service"
    return {
        "title": TITLE,
        "description": "Mac mini の kind（GKE に寄せた構成）で動く taramanji.com。deploy/k8s/observability/dashboard.py で生成",
        "layout_type": "ordered",
        "template_variables": [{"name": "service", "prefix": "service", "available_values": SERVICES, "default": "*"}],
        "widgets": [
            group("利用者から見た状態（入口: Envoy Gateway）", [
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
            group("サービス（APM の RED: Rate / Errors / Duration）", [
                service_map(),
                ts("リクエスト数（サービス別）", [f"sum:{http}.hits{{{svc_filter}}} by {{service}}.as_count()"], "bars"),
                ts("エラー数（サービス別）", [f"sum:{http}.errors{{{svc_filter}}} by {{service}}.as_count()"], "bars"),
                ts("p95 レイテンシ（サービス別, 秒）", [f"p95:{http}{{{svc_filter}}} by {{service}}"]),
                ts("p99 レイテンシ（サービス別, 秒）", [f"p99:{http}{{{svc_filter}}} by {{service}}"]),
                toplist("遅い RPC（p95）", f"p95:{http}{{{svc_filter}}} by {{service,resource_name}}", "avg"),
                toplist("エラーの多い RPC", f"sum:{http}.errors{{{svc_filter}}} by {{service,resource_name}}.as_count()"),
                ts("Apdex", [f"avg:{http}.apdex{{{svc_filter}}} by {{service}}"]),
            ], "vivid_purple"),
            group("Go ランタイム", [
                ts("goroutine 数", ["avg:runtime.go.num_goroutine{env:prod,$service} by {service}"]),
                ts("ヒープ（bytes）", ["avg:runtime.go.mem_stats.heap_alloc{env:prod,$service} by {service}"]),
                ts("GC 停止時間 p75（秒）", ["max:runtime.go.gc_stats.pause_quantiles.75p{env:prod,$service} by {service}"]),
            ], "gray"),
            group("依存先", [
                ts("外部 API のレイテンシ（content: Qiita / connpass / ORCID / OGP, ms）",
                   ["avg:content.external.duration.avg{*} by {source}", "max:content.external.duration.95percentile{*} by {source}"]),
                ts("外部 API の失敗（content）", ["sum:content.external.requests{status:error} by {source}.as_count()"], "bars"),
                ts("予約の外部呼び出し（GAS / Google Calendar, ms）",
                   ["avg:reservation.calendar.latency.avg{*} by {via,op}", "max:reservation.calendar.latency.95percentile{*} by {via,op}"]),
                ts("iCal の取得（ms）", ["max:reservation.ical.latency.95percentile{*} by {source,status}"]),
                ts("Redis コマンド p95（APM, 秒）", ["p95:trace.redis.command{env:prod} by {service}"]),
                ts("Redis メモリ", [f"max:redis.mem.used{{{CLUSTER}}}", f"max:redis.mem.maxmemory{{{CLUSTER}}}"]),
                ts("Redis 接続数", [f"max:redis.net.clients{{{CLUSTER}}}"]),
            ], "vivid_orange"),
            group("業務", [
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
            group("カレンダー同期", [
                value("同期中の予定", "max:calendar_sync.mirrors{*}"),
                value("接続アカウント", "max:calendar_sync.accounts{*}"),
                value("要再接続", "max:calendar_sync.accounts.reconnect_needed{*}"),
                ts("書き込み・削除", ["sum:calendar_sync.writes{*}.as_count()", "sum:calendar_sync.deletes{*}.as_count()"], "bars",
                   [{"formula": "q0", "alias": "書き込み"}, {"formula": "q1", "alias": "削除"}]),
                ts("1 回の同期の時間（ms）", ["avg:calendar_sync.run.duration_ms.avg{*}", "max:calendar_sync.run.duration_ms.95percentile{*}"],
                   formulas=[{"formula": "q0", "alias": "平均"}, {"formula": "q1", "alias": "p95"}]),
                ts("実行結果", ["sum:calendar_sync.run{*} by {status}.as_count()"], "bars"),
            ], "vivid_yellow"),
            group("基盤（kind / k8s）", [
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
                ts("トンネルの接続数（cloudflared）", ["sum:cloudflared.cloudflared_tunnel_ha_connections{kube_cluster_name:taramanji-kind}"]),
            ], "gray"),
            group("ログ（エラー）", [
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
