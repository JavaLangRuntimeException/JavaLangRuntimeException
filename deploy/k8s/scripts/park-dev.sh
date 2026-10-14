#!/usr/bin/env bash
# 閉じた PR が入っている devN を止めて（0 台）main にコミットする（CI 用）
# どの devN に入っているかは pick-dev.sh と同じく、main にある最後の deploy(devNN) コミットで判断する
# 使い方: park-dev.sh <PR の URL>
set -euo pipefail
FROM="${1:?usage: park-dev.sh <PR URL>}"
cd "$(dirname "$0")/../../.."
env=""
for e in dev01 dev02 dev03; do
  subject="$(git log -1 --format='%s' --grep="^deploy($e): " HEAD -- "deploy/k8s/overlays/$e")"
  if [[ "$subject" == *" from $FROM [skip ci]" ]]; then env="$e"; break; fi
done
[ -n "$env" ] || { echo "この PR が入っている dev はありません"; exit 0; }
deploy/k8s/scripts/set-dev-replicas.sh "$env" 0
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git commit -am "park(${env}): ${FROM} を閉じたので止める [skip ci]" || { echo "変更なし（もう止まっている）"; exit 0; }
for _ in 1 2 3; do
  git pull --rebase origin main && git push origin HEAD:main && exit 0
  sleep 5
done
exit 1
