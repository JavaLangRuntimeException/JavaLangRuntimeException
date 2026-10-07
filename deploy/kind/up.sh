#!/usr/bin/env bash
# kind の本番クラスターを用意する（何度実行しても同じ結果。Mac mini 起動時にも launchd から呼ぶ）
#  - kind クラスター taramanji
#  - cloud-provider-kind（type: LoadBalancer に IP を付ける）
set -euo pipefail
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
NAME=taramanji

# Docker の起動を待つ
for _ in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 5; done

# 1. クラスター（なければ作る。止まっていれば起こす）
mkdir -p "$HOME/taramanji-data/worker" "$HOME/taramanji-data/worker2"
if ! kind get clusters 2>/dev/null | grep -qx $NAME; then
  kind create cluster --config cluster.yaml --wait 5m
else
  for n in $(docker ps -a --filter "label=io.x-k8s.kind.cluster=$NAME" --format '{{.Names}}'); do
    [ "$(docker inspect -f '{{.State.Running}}' "$n")" = "true" ] || docker start "$n" >/dev/null
  done
fi
kind export kubeconfig --name $NAME >/dev/null

# 2. cloud-provider-kind（LoadBalancer のみ。Gateway は Envoy Gateway に任せるので無効化）
if [ "$(docker inspect -f '{{.State.Running}}' cloud-provider-kind 2>/dev/null || true)" != "true" ]; then
  docker rm -f cloud-provider-kind >/dev/null 2>&1 || true
  docker run -d --restart=always --name cloud-provider-kind --network kind \
    -v /var/run/docker.sock:/var/run/docker.sock \
    registry.k8s.io/cloud-provider-kind/cloud-controller-manager:v0.12.0 \
    --gateway-channel=disabled --enable-default-ingress=false --enable-lb-port-mapping
fi

kubectl --context kind-$NAME wait --for=condition=Ready nodes --all --timeout=300s
kubectl --context kind-$NAME get nodes -o wide
