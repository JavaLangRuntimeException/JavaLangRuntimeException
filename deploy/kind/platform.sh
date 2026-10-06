#!/usr/bin/env bash
# GKE では最初から用意されている部品を kind に入れる（何度実行しても同じ結果）
#  - metrics-server（HPA 用）
#  - Envoy Gateway（Gateway API。GKE Gateway の代わり）
#  - StorageClass standard-rwo（GKE と同じ名前。実体は local-path）
set -euo pipefail
cd "$(dirname "$0")"
CTX=kind-taramanji
k() { kubectl --context $CTX "$@"; }

helm repo add metrics-server https://kubernetes-sigs.github.io/metrics-server/ >/dev/null 2>&1 || true
helm repo update metrics-server >/dev/null
helm --kube-context $CTX upgrade --install metrics-server metrics-server/metrics-server -n kube-system \
  --set 'args={--kubelet-insecure-tls}' --wait

helm --kube-context $CTX upgrade --install eg oci://docker.io/envoyproxy/gateway-helm --version v1.9.2 \
  -n envoy-gateway-system --create-namespace --wait

k apply -f storageclass.yaml
k get sc
