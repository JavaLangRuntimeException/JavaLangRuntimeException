#!/usr/bin/env bash
# Datadog Agent を kind に入れる / 更新する。API キーは deploy/k8s/secrets/prod/datadog-api-key（git に入らない）から入れる（表示しない）
set -euo pipefail
cd "$(dirname "$0")"
CTX=kind-taramanji
k() { kubectl --context "$CTX" "$@"; }
k create namespace datadog --dry-run=client -o yaml | k apply -f -
KEY=../secrets/prod/datadog-api-key
if ! k -n datadog get secret datadog-secret >/dev/null 2>&1; then
  [ -f "$KEY" ] || { echo "$KEY がありません（Datadog の API キーを置いてください）" >&2; exit 1; }
  k -n datadog create secret generic datadog-secret --from-file=api-key="$KEY"
fi
helm repo add datadog https://helm.datadoghq.com >/dev/null 2>&1 || true
helm repo update datadog >/dev/null
helm --kube-context "$CTX" upgrade --install datadog datadog/datadog -n datadog -f datadog-values.yaml --wait --timeout 6m
k -n datadog get pods -o wide
