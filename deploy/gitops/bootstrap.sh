#!/usr/bin/env bash
# GitOps の土台をクラスターに入れる（最初の 1 回。何度実行しても同じ結果）。
#  - Sealed Secrets: 暗号化した Secret を Git（public）に置き、クラスターの中でだけ復号する
#  - Argo Rollouts: 本番のカナリア（Gateway API の重み + Datadog の指標で自動判定）
#  - Argo CD: Git のマニフェストをクラスターへ反映（dev / prod）
# GKE でも同じ手順（Sealed Secrets の代わりに Secret Manager + External Secrets を使うことが多い）
set -euo pipefail
cd "$(dirname "$0")"
CTX="${KUBE_CONTEXT:-kind-taramanji}"
k() { kubectl --context "$CTX" "$@"; }

k apply --server-side -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.40.0/controller.yaml
k -n kube-system rollout status deploy/sealed-secrets-controller --timeout=180s

helm --kube-context "$CTX" upgrade --install argo-rollouts argo/argo-rollouts --version 2.43.5 \
  -n argo-rollouts --create-namespace -f rollouts-values.yaml --wait
# プラグインが HTTPRoute を書き換えられるようにする
k apply -f rollouts-gatewayapi-rbac.yaml

helm --kube-context "$CTX" upgrade --install argocd argo/argo-cd --version 10.9.6 \
  -n argocd --create-namespace -f argocd-values.yaml --wait

k apply -f root.yaml
echo
echo "Argo CD の画面: kubectl --context $CTX -n argocd port-forward svc/argocd-server 8080:80 → http://localhost:8080"
echo "初期パスワード: kubectl --context $CTX -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d"
