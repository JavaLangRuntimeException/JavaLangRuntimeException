#!/usr/bin/env bash
# Datadog Agent を入れる / 更新する。API キーはファイルから読む（会話やコマンド履歴に残さない）
# 使い方: ./k8s/datadog/install.sh ~/Downloads/dd-api-key.txt   （2 回目以降はファイル省略可）
set -euo pipefail
cd "$(dirname "$0")"
CONTEXT="${KUBE_CONTEXT:-orbstack}"
k() { kubectl --context "$CONTEXT" "$@"; }

k create namespace datadog --dry-run=client -o yaml | k apply -f -
if [ $# -gt 0 ]; then
  tmp="$(mktemp)"
  tr -d '[:space:]' < "$1" > "$tmp"
  k -n datadog create secret generic datadog-secret --from-file=api-key="$tmp" --dry-run=client -o yaml | k apply -f -
  rm -f "$tmp"
fi
helm repo add datadog https://helm.datadoghq.com >/dev/null 2>&1 || true
helm repo update datadog >/dev/null
helm --kube-context "$CONTEXT" upgrade --install datadog datadog/datadog -n datadog -f values.yaml --wait --timeout 5m
k -n datadog get pods
