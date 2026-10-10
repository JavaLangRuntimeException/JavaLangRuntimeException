#!/usr/bin/env bash
# deploy/k8s/secrets/<env>/ の平文から SealedSecret を作り、overlays/<env>/sealed/ に書く（ここはコミットしてよい）。
# クラスターの公開鍵で暗号化するので、復号できるのはこのクラスターの Sealed Secrets コントローラーだけ。
# dev01〜03 は secrets/dev/ を共通で使い、namespace（Redis の接続先も）だけをその環境のものにして暗号化する
# 使い方: scripts/seal.sh prod|stg|dev01|dev02|dev03
set -euo pipefail
ENV="${1:?usage: seal.sh prod|stg|dev01|dev02|dev03}"
cd "$(dirname "$0")/.."
CTX="${KUBE_CONTEXT:-kind-taramanji}"
SRC="secrets/$ENV"
case "$ENV" in dev[0-9][0-9]) SRC="secrets/dev" ;; esac
OUT="overlays/$ENV/sealed"
mkdir -p "$OUT"
rm -f "$OUT"/*.yaml

if [ "$ENV" = "prod" ]; then APP_NS=taramanji; DATA_NS=data; else APP_NS="taramanji-$ENV"; DATA_NS="taramanji-$ENV"; fi
# 平文の中の namespace（REDIS_URL の redis.taramanji-dev.svc など）を、その環境のものにして渡す
envfile() { sed "s/\.taramanji-dev\.svc/.$APP_NS.svc/g" "$1"; }

seal() { # name namespace kubectl-create-args...
  local name=$1 ns=$2; shift 2
  kubectl create secret generic "$name" -n "$ns" "$@" --dry-run=client -o json \
    | kubeseal --context "$CTX" --controller-namespace kube-system --format yaml > "$OUT/$name.yaml"
  echo "  $OUT/$name.yaml"
}

for svc in identity notification inquiry reservation worklocation content calendarsync; do
  seal "$svc-env" "$APP_NS" --from-env-file=<(envfile "$SRC/$svc.env")
done
seal redis-acl "$DATA_NS" --from-file=users.acl="$SRC/users.acl"

if [ "$ENV" = "prod" ]; then
  # Cloudflare Tunnel の認証情報（cloudflared tunnel create が作った JSON）
  for t in staging prod; do
    if [ -f "$SRC/tunnel-$t.json" ]; then
      seal "tunnel-credentials-$t" cloudflared --from-file=credentials.json="$SRC/tunnel-$t.json" \
        --from-literal=tunnel-id="$(python3 -c "import json;print(json.load(open('$SRC/tunnel-$t.json'))['TunnelID'])")"
    fi
  done
  # Argo Rollouts がカナリアの判定で Datadog を読むためのキー
  if [ -f "$SRC/datadog-api-key" ]; then
    seal datadog argo-rollouts --from-literal=address=https://api.us5.datadoghq.com \
      --from-file=api-key="$SRC/datadog-api-key" --from-file=app-key="$SRC/datadog-app-key"
  fi
fi

{
  echo "# seal.sh が作る（暗号化済み。復号できるのはクラスターの Sealed Secrets コントローラーだけ）"
  echo "apiVersion: kustomize.config.k8s.io/v1beta1"
  echo "kind: Kustomization"
  echo "resources:"
  for f in "$OUT"/*.yaml; do [ "$(basename "$f")" = kustomization.yaml ] || echo "  - $(basename "$f")"; done
} > "$OUT/kustomization.yaml.tmp" && mv "$OUT/kustomization.yaml.tmp" "$OUT/kustomization.yaml"
