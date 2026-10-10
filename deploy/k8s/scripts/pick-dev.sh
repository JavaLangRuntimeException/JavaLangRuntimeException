#!/usr/bin/env bash
# PR（やブランチ）を出す dev（dev01〜03）を決めて出す（cd 用）。
#   1. その PR がいま入っている devN があれば、そこ（同じ PR の 2 回目以降は同じ場所に出し直す）
#   2. なければ、一番前に使われた devN（一度も使っていないものが最優先）
# 「いま入っている」「使われた時刻」は、main にある最後の deploy(devNN) コミットで判断する
# （cd の deploy ジョブは 1 つずつしか動かないので、同時に同じ devN を選ぶことはない）
# 使い方: pick-dev.sh <どこから（PR の URL やブランチ名）>
set -euo pipefail
FROM="${1:?usage: pick-dev.sh <PR URL or branch>}"
cd "$(dirname "$0")/../../.."
best=""; best_t=""
for env in dev01 dev02 dev03; do
  last="$(git log -1 --format='%ct %s' --grep="^deploy($env): " HEAD -- "deploy/k8s/overlays/$env")"
  t="${last%% *}"; subject="${last#* }"
  if [ -n "$last" ] && [[ "$subject" == *" from $FROM [skip ci]" ]]; then echo "$env"; exit 0; fi
  t="${t:-0}"
  if [ -z "$best" ] || [ "$t" -lt "$best_t" ]; then best="$env"; best_t="$t"; fi
done
echo "$best"
