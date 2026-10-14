#!/usr/bin/env bash
# dev の台数を変える（1 = 動かす / 0 = 止める）。コミットはしない（呼んだ側がする）
# dev は PR を出したときだけ使うので、PR を閉じたら 0 にして kind のメモリを空けておく
# 使い方: set-dev-replicas.sh dev01|dev02|dev03 0|1
set -euo pipefail
ENV="${1:?usage: set-dev-replicas.sh <devNN> <0|1>}"; N="${2:?usage: set-dev-replicas.sh <devNN> <0|1>}"
case "$ENV" in dev0[1-3]) ;; *) echo "dev01〜03 だけ: $ENV" >&2; exit 1 ;; esac
case "$N" in 0|1) ;; *) echo "0 か 1: $N" >&2; exit 1 ;; esac
cd "$(dirname "$0")/../../.."
f="deploy/k8s/overlays/$ENV/replicas.yaml"
sed -i.bak -E "s/^(  value: )[0-9]+$/\1$N/" "$f" && rm -f "$f.bak"
grep -q "^  value: $N$" "$f"
