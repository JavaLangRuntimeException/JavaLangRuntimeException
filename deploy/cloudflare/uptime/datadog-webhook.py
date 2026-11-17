#!/usr/bin/env python3
"""
Datadog の Webhook「taramanji-mail」「taramanji-cloud-mail」「taramanji-cloud-discord」を作る / 更新する。モニターの通知を Cloudflare Worker（taramanji-uptime）に送り、
Worker が予約のメールと同じ SES から自分にメールする。モニター側は NOTIFY="@webhook-taramanji-mail" で付ける。

  python3 deploy/cloudflare/uptime/datadog-webhook.py https://taramanji-uptime.<サブドメイン>.workers.dev <トークンのファイル>

トークンは Worker の WEBHOOK_TOKEN と同じ値（ファイルで渡す。中身は表示しない）
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "k8s", "observability"))
from dashboard import call, keys  # noqa: E402

# 名前 → Worker の /datadog に付ける送り先。taramanji-mail は今までどおり両方（メール + Discord）。
# taramanji-cloud-* は taramanji cloud のアプリの監視が、通知先ごとに使う（@webhook-taramanji-cloud-mail など）
WEBHOOKS = {"taramanji-mail": "", "taramanji-cloud-mail": "?to=mail", "taramanji-cloud-discord": "?to=discord"}
PATH = "/api/v1/integration/webhooks/configuration/webhooks"


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    base, token_file = sys.argv[1].rstrip("/"), sys.argv[2]
    token = open(token_file).read().strip()
    k = keys()
    for name, query in WEBHOOKS.items():
        body = {
            "name": name,
            "url": f"{base}/datadog{query}",
            "encode_as": "json",
            "payload": json.dumps({"title": "$EVENT_TITLE", "message": "$EVENT_MSG", "link": "$LINK"}),
            "custom_headers": json.dumps({"X-Webhook-Token": token}),
        }
        # 既にあれば更新（GET が 404 なら作る）
        try:
            call("GET", f"{PATH}/{name}", k)
            call("PUT", f"{PATH}/{name}", k, {kk: v for kk, v in body.items() if kk != "name"})
            print("更新:", name)
        except SystemExit:
            call("POST", PATH, k, body)
            print("作成:", name)


if __name__ == "__main__":
    main()
