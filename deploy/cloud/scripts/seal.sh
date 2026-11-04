#!/usr/bin/env bash
# taramanji cloud の SealedSecret を作り、overlays/<env>/sealed/ に書く（ここはコミットしてよい）。
# taramanji.com の Secret（AUTH_SECRET・Redis のパスワードなど）は使わない。入力は deploy/cloud/secrets/（git に入らない）:
#   access.env           CF_ACCESS_AUD（deploy/cloudflare/access.py が taramanji-cloud アプリから書く）
#   tunnel-cloud.json    cloudflared tunnel create taramanji-cloud の認証情報（prod だけ。トンネルは全環境で 1 本）
#   datadog-api-key / datadog-app-key   コンソールのメトリクス用（prod だけ。なければメトリクスなしで動く）。
#                        アプリケーションキーは Datadog で「metrics_read」と「timeseries_query」だけのスコープにして作る
# ADMIN_EMAIL は deploy/k8s/secrets/prod/identity.env から読む（Access の許可と同じ 1 人）
# 使い方: deploy/cloud/scripts/seal.sh prod|stg|dev
set -euo pipefail
ENV="${1:?usage: seal.sh prod|stg|dev}"
cd "$(dirname "$0")/.."
CTX="${KUBE_CONTEXT:-kind-taramanji}"
SRC=secrets
OUT="overlays/$ENV/sealed"
NS=cloud
[ "$ENV" = prod ] || NS="cloud-$ENV"
mkdir -p "$OUT"
rm -f "$OUT"/*.yaml

get() { grep -E "^$1=" "$2" | head -1 | cut -d= -f2-; }
AUD="$(get CF_ACCESS_AUD "$SRC/access.env")"
EMAIL="$(get ADMIN_EMAIL ../k8s/secrets/prod/identity.env)"
[ -n "$AUD" ] || { echo "$SRC/access.env に CF_ACCESS_AUD がない（先に deploy/cloudflare/access.py を実行する）" >&2; exit 1; }
[ -n "$EMAIL" ] || { echo "ADMIN_EMAIL が読めない" >&2; exit 1; }

seal() { # name namespace kubectl-create-args...
  local name=$1 ns=$2; shift 2
  kubectl create secret generic "$name" -n "$ns" "$@" --dry-run=client -o json \
    | kubeseal --context "$CTX" --controller-namespace kube-system --format yaml > "$OUT/$name.yaml"
  echo "  $OUT/$name.yaml"
}

args=(--from-literal=CF_ACCESS_AUD="$AUD" --from-literal=ADMIN_EMAIL="$EMAIL")
if [ "$ENV" = prod ] && [ -f "$SRC/datadog-api-key" ]; then
  args+=(--from-file=DD_METRICS_API_KEY="$SRC/datadog-api-key" --from-file=DD_METRICS_APP_KEY="$SRC/datadog-app-key")
fi
seal cloud-api-env "$NS" "${args[@]}"

if [ "$ENV" = prod ]; then
  [ -f "$SRC/tunnel-cloud.json" ] || { echo "$SRC/tunnel-cloud.json がない（cloudflared tunnel create taramanji-cloud）" >&2; exit 1; }
  seal tunnel-credentials-cloud cloud-cloudflared --from-file=credentials.json="$SRC/tunnel-cloud.json" \
    --from-literal=tunnel-id="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['TunnelID'])" "$SRC/tunnel-cloud.json")"
fi

{
  echo "# scripts/seal.sh が作る（暗号化済み。復号できるのはクラスターの Sealed Secrets コントローラーだけ）"
  echo "apiVersion: kustomize.config.k8s.io/v1beta1"
  echo "kind: Kustomization"
  echo "resources:"
  for f in "$OUT"/*.yaml; do [ "$(basename "$f")" = kustomization.yaml ] || echo "  - $(basename "$f")"; done
} > "$OUT/kustomization.yaml.tmp" && mv "$OUT/kustomization.yaml.tmp" "$OUT/kustomization.yaml"
