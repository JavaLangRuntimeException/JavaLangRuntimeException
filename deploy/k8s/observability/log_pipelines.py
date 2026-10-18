#!/usr/bin/env python3
"""
Datadog のログのパイプラインと、ログから作るメトリクスを作る / 更新する（名前が同じものは上書き）。

  python3 deploy/k8s/observability/log_pipelines.py

- Envoy Gateway のアクセスログ（全環境の HTTP リクエスト 1 件ずつ。datadog-values.yaml で収集）:
  client_ip などを Datadog の標準属性（network.client.ip・http.*）に直し、IP から国・都市（GeoIP）、
  User-Agent からブラウザ・OS を引き、ステータスコードでログのレベルを決める
- Mac mini の sshd のログ（deploy/mac/ssh-logs が送る）: IP から GeoIP を引き、
  認証の成否（@evt.outcome）を taramanji.ssh.auth というメトリクスにする（ダッシュボード・モニター用）
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from dashboard import call, keys  # noqa: E402


def remap(src, dst):
    return {"type": "attribute-remapper", "name": f"{src} → {dst}", "is_enabled": True,
            "sources": [src], "source_type": "attribute", "target": dst, "target_type": "attribute",
            "preserve_source": False, "override_on_conflict": True}


def geoip(src="network.client.ip"):
    return {"type": "geo-ip-parser", "name": "IP から国・都市", "is_enabled": True,
            "sources": [src], "target": "network.client.geoip"}


PIPELINES = [
    {
        "name": "taramanji: Gateway のアクセスログ",
        "is_enabled": True,
        "filter": {"query": "source:envoy service:gateway"},
        "processors": [
            remap("client_ip", "network.client.ip"),
            remap("method", "http.method"),
            remap("path", "http.url_details.path"),
            remap("authority", "http.url_details.host"),
            remap("status_code", "http.status_code"),
            remap("user_agent", "http.useragent"),
            remap("request_id", "http.request_id"),
            # duration は Datadog の標準ではナノ秒
            {"type": "arithmetic-processor", "name": "duration_ms → duration（ns）", "is_enabled": True,
             "expression": "duration_ms * 1000000", "target": "duration", "is_replace_missing": False},
            geoip(),
            {"type": "user-agent-parser", "name": "User-Agent を分解", "is_enabled": True,
             "sources": ["http.useragent"], "target": "http.useragent_details", "is_encoded": False},
            {"type": "category-processor", "name": "ステータスコードの分類", "is_enabled": True, "target": "http.status_category",
             "categories": [
                 {"filter": {"query": "@http.status_code:[200 TO 399]"}, "name": "ok"},
                 {"filter": {"query": "@http.status_code:[400 TO 499]"}, "name": "warn"},
                 {"filter": {"query": "@http.status_code:[500 TO 599]"}, "name": "error"},
             ]},
            {"type": "status-remapper", "name": "ログのレベル", "is_enabled": True, "sources": ["http.status_category"]},
        ],
    },
    {
        "name": "taramanji: SSH（Mac mini の sshd）",
        "is_enabled": True,
        "filter": {"query": "source:sshd"},
        "processors": [geoip()],
    },
]

# ログから作るメトリクス（ログを消しても数は残る。モニターとダッシュボードで使う）
LOG_METRICS = {
    "taramanji.ssh.auth": {
        "filter": {"query": "source:sshd @evt.name:(authentication OR connection)"},
        "group_by": [{"path": "@evt.outcome", "tag_name": "outcome"}, {"path": "@evt.name", "tag_name": "event"},
                     {"path": "@usr.name", "tag_name": "ssh_user"}, {"path": "@tailscale.device", "tag_name": "device"}],
    },
}


def main():
    k = keys()
    existing = {p["name"]: p["id"] for p in call("GET", "/api/v1/logs/config/pipelines", k)}
    for p in PIPELINES:
        if p["name"] in existing:
            call("PUT", f"/api/v1/logs/config/pipelines/{existing[p['name']]}", k, p)
            print("更新:", p["name"])
        else:
            call("POST", "/api/v1/logs/config/pipelines", k, p)
            print("作成:", p["name"])
    metrics = {m["id"] for m in call("GET", "/api/v2/logs/config/metrics", k).get("data", [])}
    for mid, attrs in LOG_METRICS.items():
        if mid in metrics:
            call("PATCH", f"/api/v2/logs/config/metrics/{mid}", k, {"data": {"type": "logs_metrics", "attributes": attrs}})
            print("更新:", mid)
        else:
            call("POST", "/api/v2/logs/config/metrics", k,
                 {"data": {"id": mid, "type": "logs_metrics", "attributes": {"compute": {"aggregation_type": "count"}, **attrs}}})
            print("作成:", mid)


if __name__ == "__main__":
    main()
