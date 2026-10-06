#!/usr/bin/env bash
# Datadog Agent を kind に入れる / 更新する。API キーは旧クラスター（OrbStack）の Secret から写す（表示しない）
set -euo pipefail
cd "$(dirname "$0")"
CTX=kind-taramanji
k() { kubectl --context "$CTX" "$@"; }
k create namespace datadog --dry-run=client -o yaml | k apply -f -
if ! k -n datadog get secret datadog-secret >/dev/null 2>&1; then
  kubectl --context orbstack -n datadog get secret datadog-secret -o json \
    | python3 -c 'import json,sys; s=json.load(sys.stdin); print(json.dumps({"apiVersion":"v1","kind":"Secret","metadata":{"name":"datadog-secret","namespace":"datadog"},"type":"Opaque","data":s["data"]}))' \
    | k apply -f -
fi
helm repo add datadog https://helm.datadoghq.com >/dev/null 2>&1 || true
helm repo update datadog >/dev/null
helm --kube-context "$CTX" upgrade --install datadog datadog/datadog -n datadog -f datadog-values.yaml --wait --timeout 6m
k -n datadog get pods -o wide
