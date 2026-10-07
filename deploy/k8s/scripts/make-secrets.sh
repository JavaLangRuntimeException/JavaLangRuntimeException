#!/usr/bin/env bash
# 環境ごとの平文の Secret を deploy/k8s/secrets/<env>/ に作る（中身は表示しない。このディレクトリは git に入らない）。
#  - 外部サービスの値（SES・GAS・Google の OAuth クライアント・iCal）は旧構成の Secret（k8s/*/secret.env）から取る
#  - AUTH_SECRET・Redis のパスワード・CronJob のトークン・同期の暗号鍵は環境ごとに新しく作る（既にあれば再利用）
#    ※ prod の同期の暗号鍵だけは、旧構成で暗号化した更新トークンを読むために旧構成と同じものを使う
# 使い方: scripts/make-secrets.sh prod|dev  → 続けて scripts/seal.sh prod|dev
set -euo pipefail
ENV="${1:?usage: make-secrets.sh prod|dev}"
cd "$(dirname "$0")/.."
mkdir -p "secrets/$ENV"
umask 077

python3 - "$ENV" <<'PY'
import base64, os, secrets, sys
env = sys.argv[1]
out = f"secrets/{env}"
legacy = "../../k8s"

def load(path):
    d = {}
    if os.path.exists(path):
        for line in open(path):
            line = line.rstrip("\n")
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                d[k.strip()] = v.strip().strip('"')
    return d

portfolio = load(f"{legacy}/portfolio/secret.env")
cal = load(f"{legacy}/calendar-sync/secret.env")
state = load(f"{out}/generated.env")
prev_inquiry = load(f"{out}/inquiry.env")

def gen(key, n=32):
    if key not in state:
        state[key] = secrets.token_urlsafe(n)
    return state[key]

if env == "prod":
    redis_host, enc_key, cron = "redis-0.redis.data.svc.cluster.local", cal["CALENDAR_SYNC_ENC_KEY"], cal["CALENDAR_SYNC_CRON_TOKEN"]
else:
    redis_host = f"redis-0.redis.taramanji-{env}.svc.cluster.local"
    if "CALENDAR_SYNC_ENC_KEY" not in state:
        state["CALENDAR_SYNC_ENC_KEY"] = base64.b64encode(secrets.token_bytes(32)).decode()
    enc_key, cron = state["CALENDAR_SYNC_ENC_KEY"], gen("CALENDAR_SYNC_CRON_TOKEN")

auth = {"AUTH_SECRET": gen("AUTH_SECRET", 48), "ADMIN_EMAIL": cal["ADMIN_EMAIL"]}
google = {"GOOGLE_CLIENT_ID": cal["GOOGLE_CLIENT_ID"], "GOOGLE_CLIENT_SECRET": cal["GOOGLE_CLIENT_SECRET"]}
redis_db = {"worklocation": 0, "content": 1, "calendarsync": 2}
def redis_url(svc):
    return f"redis://{svc}:{gen('REDIS_PASSWORD_' + svc.upper())}@{redis_host}:6379/{redis_db[svc]}"

files = {
    "identity": {**auth, **google},
    "notification": {k: portfolio[k] for k in ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION", "FROM_EMAIL"]},
    # お問い合わせの通知先（作り直しても前回の値を使い回す。初回は管理者のアドレス）
    "inquiry": {**auth, "INQUIRY_NOTIFY_EMAIL": prev_inquiry.get("INQUIRY_NOTIFY_EMAIL", cal["ADMIN_EMAIL"])},
    "reservation": {**auth, **{k: portfolio[k] for k in ["GCAL_CALENDAR_ID", "GCAL_WEBHOOK_URL", "ICAL_URLS"]}},
    "worklocation": {**auth, "REDIS_URL": redis_url("worklocation")},
    "content": {"REDIS_URL": redis_url("content")},
    "calendarsync": {**auth, **google, "REDIS_URL": redis_url("calendarsync"),
                     "CALENDAR_SYNC_ENC_KEY": enc_key, "CALENDAR_SYNC_CRON_TOKEN": cron},
}
for name, values in files.items():
    with open(f"{out}/{name}.env", "w") as f:
        f.writelines(f"{k}={v}\n" for k, v in values.items())

acl = [
    "user default off",
    "user probe on nopass -@all +ping",
    "user datadog on nopass -@all +ping +info +client|list +config|get +slowlog|get +slowlog|len +latency|latest +dbsize",
    f"user admin on >{gen('REDIS_PASSWORD_ADMIN')} ~* &* +@all",
    f"user worklocation on >{gen('REDIS_PASSWORD_WORKLOCATION')} ~workLocations:* resetchannels -@all +@read +@write +@keyspace +@transaction +@connection -@dangerous",
    f"user content on >{gen('REDIS_PASSWORD_CONTENT')} ~content:* resetchannels -@all +@read +@write +@keyspace +@connection -@dangerous",
    f"user calendarsync on >{gen('REDIS_PASSWORD_CALENDARSYNC')} ~calendarAccounts:* ~syncMirrors:* ~syncSettings:* ~cal_sync:* resetchannels -@all +@read +@write +@keyspace +@transaction +@scripting +@connection -@dangerous",
]
with open(f"{out}/users.acl", "w") as f:
    f.write("\n".join(acl) + "\n")
with open(f"{out}/generated.env", "w") as f:
    f.writelines(f"{k}={v}\n" for k, v in sorted(state.items()))
print(f"{out}:", ", ".join(sorted(os.listdir(out))))
PY
