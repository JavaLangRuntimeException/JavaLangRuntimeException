#!/usr/bin/env python3
"""
Datadog に「taramanji.com on Mac mini」ダッシュボードを作る / 更新する（同じタイトルがあれば上書き）。

  python3 k8s/datadog/dashboard.py ~/Downloads/dd-app-key.txt   # 初回: Application Key を Secret に保存してファイルを消す
  python3 k8s/datadog/dashboard.py                              # 2 回目以降（Secret の鍵を使う）

API キーは Agent 用の Secret（datadog/datadog-secret）から読む。標準ライブラリだけで動く。
"""
import base64
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

SITE = "us5.datadoghq.com"
API = f"https://api.{SITE}"
TITLE = "taramanji.com on Mac mini (k8s)"
CONTEXT = os.environ.get("KUBE_CONTEXT", "orbstack")
CLUSTER = "kube_cluster_name:taramanji-macmini"
# 自分のアプリの namespace（Datadog や k8s 自体の Pod は除く）
APPS = "kube_namespace IN (portfolio,calendar-sync,cloudflared)"


def kubectl(*args, stdin=None):
    return subprocess.run(["kubectl", "--context", CONTEXT, *args], input=stdin, capture_output=True, text=True, check=True).stdout


def secret(name, key):
    out = kubectl("-n", "datadog", "get", "secret", name, "-o", f"jsonpath={{.data.{key}}}")
    return base64.b64decode(out).decode().strip()


def load_keys():
    if len(sys.argv) > 1:
        app_key = "".join(open(os.path.expanduser(sys.argv[1])).read().split())
        manifest = kubectl("-n", "datadog", "create", "secret", "generic", "datadog-app-key",
                           f"--from-literal=app-key={app_key}", "--dry-run=client", "-o", "yaml")
        kubectl("apply", "-f", "-", stdin=manifest)
        os.remove(os.path.expanduser(sys.argv[1]))
        print("Application Key を Secret（datadog/datadog-app-key）に保存し、ファイルを削除しました")
    return secret("datadog-secret", "api-key"), secret("datadog-app-key", "app-key")


def call(method, path, keys, body=None):
    req = urllib.request.Request(API + path, method=method, data=None if body is None else json.dumps(body).encode(),
                                 headers={"DD-API-KEY": keys[0], "DD-APPLICATION-KEY": keys[1], "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return json.load(res)
    except urllib.error.HTTPError as e:
        sys.exit(f"Datadog API {method} {path}: HTTP {e.code} {e.read().decode()[:500]}")


# ---------- ウィジェット ----------
def ts(title, queries, display="line", formulas=None):
    return {"definition": {
        "type": "timeseries", "title": title, "show_legend": True,
        "requests": [{
            "queries": [{"data_source": "metrics", "name": f"q{i}", "query": q} for i, q in enumerate(queries)],
            "formulas": formulas or [{"formula": f"q{i}"} for i in range(len(queries))],
            "display_type": display,
            "response_format": "timeseries",
        }],
    }}


def value(title, query, aggregator="last", unit=None):
    d = {"type": "query_value", "title": title, "precision": 0, "autoscale": True,
         "requests": [{"queries": [{"data_source": "metrics", "name": "q0", "query": query, "aggregator": aggregator}],
                       "formulas": [{"formula": "q0"}], "response_format": "scalar"}]}
    if unit:
        d["custom_unit"] = unit
    return {"definition": d}


def toplist(title, query):
    return {"definition": {
        "type": "toplist", "title": title,
        "requests": [{"queries": [{"data_source": "metrics", "name": "q0", "query": query, "aggregator": "sum"}],
                      "formulas": [{"formula": "q0", "limit": {"count": 10, "order": "desc"}}], "response_format": "scalar"}],
    }}


def group(title, widgets, color="yellow"):
    return {"definition": {"type": "group", "title": title, "layout_type": "ordered", "background_color": color, "widgets": widgets}}


def dashboard(cf):
    """cf: cloudflared のメトリクス名の接頭辞（実際に届いている名前に合わせる）"""
    return {
        "title": TITLE,
        "description": "自宅の Mac mini（OrbStack k8s）で動く taramanji.com・カレンダー同期・トンネルの状態。k8s/datadog/dashboard.py で生成",
        "layout_type": "ordered",
        "template_variables": [],
        "widgets": [
            # ブラウザがページを表示した回数（ボットと /admin は除く）。src/components/PageviewBeacon.tsx
            group("アクセス（ページビュー）", [
                value("表示期間のページビュー", "sum:web.pageviews{*}.as_count()", "sum"),
                toplist("よく見られているページ", "sum:web.pageviews{*} by {page}.as_count()"),
                ts("ページビューの推移（ページ別）", ["sum:web.pageviews{*} by {page}.as_count()"], "bars"),
            ], "orange"),
            group("サイト（Cloudflare Tunnel 経由）", [
                value("トンネルの接続数（正常は 4 以上）", f"sum:{cf}_ha_connections{{*}}"),
                value("直近 1 時間のリクエスト", f"sum:{cf}_total_requests.count{{*}}.as_count()", "sum"),
                ts("リクエスト数", [f"sum:{cf}_total_requests.count{{*}}.as_count()"], "bars"),
                ts("ステータスコード別", [f"sum:{cf}_response_by_code.count{{*}} by {{status_code}}.as_count()"], "bars"),
                ts("トンネルのエラー", [f"sum:{cf}_request_errors.count{{*}}.as_count()"], "bars"),
            ]),
            group("Pod", [
                ts("CPU（アプリ別, millicores）", [f"sum:container.cpu.usage{{{CLUSTER} AND {APPS}}} by {{kube_deployment}}"],
                   formulas=[{"formula": "q0 / 1000000"}]),
                ts("メモリ（アプリ別）", [f"sum:container.memory.usage{{{CLUSTER} AND {APPS}}} by {{kube_deployment}}"]),
                ts("コンテナの再起動", [f"sum:kubernetes_state.container.restarts{{{CLUSTER} AND {APPS}}} by {{kube_deployment}}"], "bars"),
                value("Ready の Pod", f"sum:kubernetes_state.pod.ready{{{CLUSTER} AND {APPS} AND condition:true}}"),
            ], "blue"),
            group("カレンダー同期", [
                value("同期中の予定", "max:calendar_sync.mirrors{*}"),
                value("接続アカウント", "max:calendar_sync.accounts{*}"),
                value("要再接続", "max:calendar_sync.accounts.reconnect_needed{*}"),
                ts("書き込み・削除", ["sum:calendar_sync.writes{*}.as_count()", "sum:calendar_sync.deletes{*}.as_count()"], "bars",
                   [{"formula": "q0", "alias": "書き込み"}, {"formula": "q1", "alias": "削除"}]),
                ts("1 回の同期にかかった時間（ms）", ["avg:calendar_sync.run.duration_ms.avg{*}", "max:calendar_sync.run.duration_ms.95percentile{*}"],
                   formulas=[{"formula": "q0", "alias": "平均"}, {"formula": "q1", "alias": "p95"}]),
                ts("実行結果", ["sum:calendar_sync.run{*} by {status}.as_count()"], "bars"),
                ts("エラーと次回に回した件数", ["sum:calendar_sync.errors{*}.as_count()", "max:calendar_sync.pending{*}"], "bars",
                   [{"formula": "q0", "alias": "エラー"}, {"formula": "q1", "alias": "次回へ"}]),
            ], "green"),
            group("Redis", [
                ts("メモリ使用量", [f"max:redis.mem.used{{{CLUSTER}}} by {{kube_namespace}}"]),
                ts("接続中のクライアント", [f"max:redis.net.clients{{{CLUSTER}}} by {{kube_namespace}}"]),
                ts("コマンド数（/秒）", [f"sum:redis.net.commands{{{CLUSTER}}} by {{kube_namespace}}"]),
            ], "purple"),
            group("エラーログ", [
                {"definition": {"type": "log_stream", "title": "アプリのエラー",
                                "query": "kube_namespace:(portfolio OR calendar-sync OR cloudflared) status:error",
                                "columns": ["host", "service"], "indexes": [], "message_display": "expanded-md",
                                "sort": {"column": "time", "order": "desc"}}},
            ], "pink"),
        ],
    }


def main():
    keys = load_keys()
    active = set(call("GET", f"/api/v1/metrics?from={int(time.time()) - 3 * 3600}", keys).get("metrics", []))
    cf_names = sorted(m for m in active if "cloudflared_tunnel" in m)
    cf = next((m.rsplit("_ha_connections", 1)[0] for m in cf_names if m.endswith("_ha_connections")), "cloudflared.cloudflared_tunnel")
    expected = ["web.pageviews", "calendar_sync.writes", "calendar_sync.run.duration_ms.avg", "calendar_sync.mirrors", "container.cpu.usage",
                "container.memory.usage", "kubernetes_state.container.restarts", "kubernetes_state.pod.ready",
                "redis.mem.used", "redis.net.clients", "redis.net.commands", f"{cf}_ha_connections", f"{cf}_total_requests.count",
                f"{cf}_response_by_code.count", f"{cf}_request_errors.count"]
    print("届いているメトリクスの確認:")
    for m in expected:
        print(f"  {'OK ' if m in active else '-- '} {m}")
    print("  cloudflared:", ", ".join(cf_names) or "（まだ届いていない）")

    body = dashboard(cf)
    existing = [d for d in call("GET", "/api/v1/dashboard", keys).get("dashboards", []) if d.get("title") == TITLE]
    if existing:
        result = call("PUT", f"/api/v1/dashboard/{existing[0]['id']}", keys, body)
        print("更新しました")
    else:
        result = call("POST", "/api/v1/dashboard", keys, body)
        print("作成しました")
    print(f"https://{SITE}{result['url']}")


if __name__ == "__main__":
    main()
