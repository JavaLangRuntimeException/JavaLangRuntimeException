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
NS=taramanji-cloud
[ "$ENV" = prod ] || NS="taramanji-cloud-$ENV"
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
# アプリ用のリポジトリに書くトークン（そのリポジトリの Contents の読み書きだけを許した fine-grained PAT）。本番だけ（アプリは本番だけ）。なければホスティングは使えない
if [ "$ENV" = prod ] && [ -f "$SRC/apps-repo-token" ]; then
  args+=(--from-file=APPS_REPO_TOKEN="$SRC/apps-repo-token")
fi
# 公開ホスト名の DNS の自動登録（Cloudflare）。cloudflare.env に CF_DNS_API_TOKEN（ゾーンの DNS の編集だけ）と CF_ZONE_ID を書く。
# 向き先のトンネルは tunnel-cloud.json から取る。なければ DNS は手で登録する
if [ "$ENV" = prod ] && [ -f "$SRC/cloudflare.env" ] && [ -f "$SRC/tunnel-cloud.json" ]; then
  args+=(--from-literal=CF_DNS_API_TOKEN="$(get CF_DNS_API_TOKEN "$SRC/cloudflare.env")" --from-literal=CF_ZONE_ID="$(get CF_ZONE_ID "$SRC/cloudflare.env")" \
    --from-literal=CF_TUNNEL_ID="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['TunnelID'])" "$SRC/tunnel-cloud.json")")
  # CDN の独自ドメインを Cloudflare Access に登録するトークン（Account › Access: Apps and Policies › Edit）。cloudflare.env の CF_ACCESS_API_TOKEN
  ACCESS_TOKEN="$(get CF_ACCESS_API_TOKEN "$SRC/cloudflare.env" || true)"
  [ -z "$ACCESS_TOKEN" ] || args+=(--from-literal=CF_ACCESS_API_TOKEN="$ACCESS_TOKEN")
fi
# Argo CD の画面で関数の Pod を見るための、ApplicationSet（plugin ジェネレーター）とコントローラーのあいだのトークン（本番だけ）。
# 1 回だけ作る。Argo CD 側の Secret（argocd namespace）も同じ値で作る
if [ "$ENV" = prod ]; then
  [ -f "$SRC/argocd-plugin-token" ] || (umask 077 && openssl rand -hex 32 > "$SRC/argocd-plugin-token")
  args+=(--from-file=ARGOCD_PLUGIN_TOKEN="$SRC/argocd-plugin-token")
  kubectl create secret generic taramanji-cloud-functions-plugin -n argocd --from-file=token="$SRC/argocd-plugin-token" --dry-run=client -o json \
    | kubectl label --local -f - app.kubernetes.io/part-of=argocd -o json \
    | kubeseal --context "$CTX" --controller-namespace kube-system --format yaml > ../gitops/sealed/taramanji-cloud-functions-plugin-token.yaml
  echo "  ../gitops/sealed/taramanji-cloud-functions-plugin-token.yaml"
fi
# CDN（ログイン済み）から API に渡し直したリクエストに cloud-gw が付ける署名の鍵。環境ごとに 1 回だけ作る（変えても困らない）
GW_KEY="$SRC/gateway-internal-secret-$ENV"
[ -f "$GW_KEY" ] || (umask 077 && openssl rand -hex 32 > "$GW_KEY")
args+=(--from-file=GATEWAY_INTERNAL_SECRET="$GW_KEY")
seal cloud-api-env "$NS" "${args[@]}"

# オブジェクトストレージのマスターキー（バケットのトークンを導く）。環境ごとに 1 回だけ作り、変えない（変えるとトークンが全部変わる）
KEY="$SRC/storage-master-key-$ENV"
[ -f "$KEY" ] || (umask 077 && openssl rand -hex 32 > "$KEY")
seal cloud-storage-key "$NS" --from-file=STORAGE_MASTER_KEY="$KEY"

# 共有の PostgreSQL / Redis の管理者のパスワード（コントローラーだけが使う）。環境ごとに 1 回だけ作り、変えない
# （PostgreSQL は最初の起動のときの値を覚えるので、あとから変えても反映されない）
for k in postgres redis; do
  [ -f "$SRC/$k-admin-password-$ENV" ] || (umask 077 && openssl rand -hex 24 > "$SRC/$k-admin-password-$ENV")
done
seal cloud-data-admin "$NS" --from-file=POSTGRES_ADMIN_PASSWORD="$SRC/postgres-admin-password-$ENV" --from-file=REDIS_ADMIN_PASSWORD="$SRC/redis-admin-password-$ENV"

if [ "$ENV" = prod ]; then
  [ -f "$SRC/tunnel-cloud.json" ] || { echo "$SRC/tunnel-cloud.json がない（cloudflared tunnel create taramanji-cloud）" >&2; exit 1; }
  seal tunnel-credentials-cloud taramanji-cloud-cloudflared --from-file=credentials.json="$SRC/tunnel-cloud.json" \
    --from-literal=tunnel-id="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['TunnelID'])" "$SRC/tunnel-cloud.json")"

  # 非公開のイメージを読む認証情報（関数の namespace に置き、kubelet だけが使う）。読み取り専用のトークンにする:
  #   registry-ghcr.env       USERNAME=<GitHub のユーザー名> TOKEN=<classic PAT（read:packages だけ）>
  #   registry-dockerhub.env  USERNAME=<Docker Hub のユーザー名> TOKEN=<Personal access token（Read-only）>
  # どちらもなければ作らない（公開のイメージだけ使える）
  if [ -f "$SRC/registry-ghcr.env" ] || [ -f "$SRC/registry-dockerhub.env" ]; then
    DOCKERCONFIG="$(python3 - "$SRC" <<'PY'
import base64, json, os, sys
src, auths = sys.argv[1], {}
for f, host in (("registry-ghcr.env", "ghcr.io"), ("registry-dockerhub.env", "https://index.docker.io/v1/")):
    p = os.path.join(src, f)
    if not os.path.exists(p):
        continue
    kv = dict(l.strip().split("=", 1) for l in open(p) if "=" in l and not l.startswith("#"))
    if not kv.get("USERNAME") or not kv.get("TOKEN"):
        sys.exit(f"{f} に USERNAME と TOKEN を書く")
    auths[host] = {"auth": base64.b64encode(f"{kv['USERNAME']}:{kv['TOKEN']}".encode()).decode()}
print(json.dumps({"auths": auths}, separators=(",", ":")))
PY
)"
    seal cloud-registry "$NS" --from-literal=dockerconfigjson="$DOCKERCONFIG"
  fi
fi

{
  echo "# scripts/seal.sh が作る（暗号化済み。復号できるのはクラスターの Sealed Secrets コントローラーだけ）"
  echo "apiVersion: kustomize.config.k8s.io/v1beta1"
  echo "kind: Kustomization"
  echo "resources:"
  for f in "$OUT"/*.yaml; do [ "$(basename "$f")" = kustomization.yaml ] || echo "  - $(basename "$f")"; done
} > "$OUT/kustomization.yaml.tmp" && mv "$OUT/kustomization.yaml.tmp" "$OUT/kustomization.yaml"
