#!/usr/bin/env bash
# Cloudflare Tunnel を作成し、指定したホスト名の DNS をトンネルへ向けて、k8s にデプロイする。
# 事前に一度だけ: cloudflared tunnel login（ブラウザで taramanji.com を選ぶ）
# 使い方: ./setup.sh gws.taramanji.com [他のホスト名...]
#         OVERWRITE_DNS=1 ./setup.sh taramanji.com www.taramanji.com   # Vercel 向けのレコードを置き換える
set -euo pipefail
cd "$(dirname "$0")"

NAME="${TUNNEL_NAME:-taramanji-onprem}"
CONTEXT="${KUBE_CONTEXT:-orbstack}"
[ $# -gt 0 ] || { echo "usage: $0 <hostname>..." >&2; exit 1; }

if ! cloudflared tunnel info "$NAME" >/dev/null 2>&1; then
  cloudflared tunnel create "$NAME"
fi
ID="$(cloudflared tunnel list --name "$NAME" --output json | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["id"])')"
CREDS="$HOME/.cloudflared/$ID.json"
[ -f "$CREDS" ] || { echo "認証情報 $CREDS がありません（別の端末で作ったトンネル？）" >&2; exit 1; }

# 既存のレコード（Vercel 向けなど）があると失敗する。置き換えるときは OVERWRITE_DNS=1 を付ける
overwrite=()
[ "${OVERWRITE_DNS:-}" = "1" ] && overwrite=(--overwrite-dns)
for host in "$@"; do
  cloudflared tunnel route dns ${overwrite[@]+"${overwrite[@]}"} "$NAME" "$host"
done

kubectl --context "$CONTEXT" apply -f namespace.yaml
kubectl --context "$CONTEXT" -n cloudflared create secret generic tunnel-credentials \
  --from-file=credentials.json="$CREDS" --from-literal=tunnel-id="$ID" \
  --dry-run=client -o yaml | kubectl --context "$CONTEXT" apply -f -
kubectl --context "$CONTEXT" apply -k .
kubectl --context "$CONTEXT" -n cloudflared rollout status deploy/cloudflared --timeout=120s
cloudflared tunnel info "$NAME"
