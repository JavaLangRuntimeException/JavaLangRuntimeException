#!/usr/bin/env python3
"""
dev / stg と Argo Rollouts の画面を Cloudflare Access で守る。何度実行しても同じ結果になる。
Cloudflare の入口でログインを求め、ADMIN_EMAIL のアカウントだけを通す（GKE なら IAP にあたる）。
ログイン方法は既定でワンタイム PIN（そのメールアドレスに届くコードを入れる。Google 側の設定は要らない）。
--google を付けると Google ログインにする（下の Google のリダイレクト URI の登録が必要）。

  python3 deploy/cloudflare/access.py ~/Downloads/cf-access-token.txt [--google]

必要なもの:
  - API トークン（ファイルで渡す。中身は表示しない）。権限: Account › Access: Apps and Policies › Edit、
    Account › Access: Organizations, Identity Providers, and Groups › Edit
  - Zero Trust の初期設定（チーム名の決定）が済んでいること
  - --google のときだけ: Google の OAuth クライアント（taramanji-calendar-sync）の「承認済みのリダイレクト URI」に
    https://<チーム名>.cloudflareaccess.com/cdn-cgi/access/callback を足してあること
ADMIN_EMAIL（と --google のときの Google の OAuth クライアントの ID・シークレット）は deploy/k8s/secrets/prod/identity.env から読む。
"""
import json
import os
import sys
import urllib.error
import urllib.request

ACCOUNT = os.environ.get("CF_ACCOUNT_ID", "f952fdc8cd122331a587b1ff4fdac99d")
API = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/access"
HERE = os.path.dirname(os.path.abspath(__file__))
SECRETS = os.path.join(HERE, "..", "k8s", "secrets", "prod", "identity.env")

APPS = {
    "taramanji-dev": ["dev.taramanji.com", "dev-gws.taramanji.com"],
    "taramanji-stg": ["stg.taramanji.com", "stg-gws.taramanji.com"],
    # Argo Rollouts の画面（本番のカナリアの Promote / Abort）。画面自体にログインがないので必ずここで守る
    "taramanji-rollouts": ["rollouts.taramanji.com"],
}


def load_env(path):
    d = {}
    for line in open(path):
        if "=" in line and not line.startswith("#"):
            k, v = line.rstrip("\n").split("=", 1)
            d[k] = v
    return d


def call(token, method, path, body=None):
    req = urllib.request.Request(API + path, method=method, data=None if body is None else json.dumps(body).encode(),
                                 headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return json.load(res)["result"]
    except urllib.error.HTTPError as e:
        sys.exit(f"Cloudflare API {method} {path}: HTTP {e.code} {e.read().decode()[:600]}")


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    token = open(os.path.expanduser(sys.argv[1])).read().strip()
    use_google = "--google" in sys.argv[2:]
    env = load_env(SECRETS)
    emails = [e.strip() for e in env["ADMIN_EMAIL"].split(",") if e.strip()]

    org = call(token, "GET", "/organizations")
    team = org.get("auth_domain", "")
    print("Zero Trust のチーム:", team)

    # ログイン方法（IdP）
    idps = call(token, "GET", "/identity_providers")
    if use_google:
        print("Google の OAuth クライアントのリダイレクト URI に必要:", f"https://{team}/cdn-cgi/access/callback")
        idp_body = {"name": "Google", "type": "google",
                    "config": {"client_id": env["GOOGLE_CLIENT_ID"], "client_secret": env["GOOGLE_CLIENT_SECRET"]}}
    else:
        idp_body = {"name": "One-time PIN", "type": "onetimepin", "config": {}}
    idp = next((i for i in idps if i["type"] == idp_body["type"]), None)
    idp = call(token, "PUT", f"/identity_providers/{idp['id']}", idp_body) if idp else call(token, "POST", "/identity_providers", idp_body)
    print("IdP:", idp_body["name"], idp["id"])

    # 本人だけを通すポリシー（使い回せるポリシー）
    policies = call(token, "GET", "/policies")
    pol = next((p for p in policies if p["name"] == "taramanji-admins"), None)
    pol_body = {"name": "taramanji-admins", "decision": "allow",
                "include": [{"email": {"email": e}} for e in emails], "session_duration": "24h"}
    pol = call(token, "PUT", f"/policies/{pol['id']}", pol_body) if pol else call(token, "POST", "/policies", pol_body)
    print("ポリシー: taramanji-admins（", len(emails), "件のメールアドレス）")

    # アプリ（環境ごとに 1 つ。本体と gws の 2 つのホスト名を入れる）
    apps = call(token, "GET", "/apps")
    for name, hosts in APPS.items():
        body = {
            "name": name, "type": "self_hosted",
            "domain": hosts[0],
            "destinations": [{"type": "public", "uri": h} for h in hosts],
            "allowed_idps": [idp["id"]],
            "auto_redirect_to_identity": True,
            "session_duration": "24h",
            "app_launcher_visible": False,
            "policies": [{"id": pol["id"], "precedence": 1}],
        }
        cur = next((a for a in apps if a.get("name") == name), None)
        if cur:
            call(token, "PUT", f"/apps/{cur['id']}", body)
            print("更新:", name, hosts)
        else:
            call(token, "POST", "/apps", body)
            print("作成:", name, hosts)


if __name__ == "__main__":
    main()
