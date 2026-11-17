#!/usr/bin/env bash
# 閉じた PR が入っている devN（と taramanji cloud の dev）を止めて（0 台）main にコミットする（CI 用）
# どの devN に入っているかは pick-dev.sh と同じく、main にある最後の deploy(devNN) コミットで判断する。
# taramanji cloud の dev は 1 つだけなので、deploy/cloud/overlays/dev の最後の deploy(dev) コミットがその PR なら止める
# 使い方: park-dev.sh <PR の URL>
set -euo pipefail
FROM="${1:?usage: park-dev.sh <PR URL>}"
cd "$(dirname "$0")/../../.."
envs=""
for e in dev01 dev02 dev03; do
  subject="$(git log -1 --format='%s' --grep="^deploy($e): " HEAD -- "deploy/k8s/overlays/$e")"
  if [[ "$subject" == *" from $FROM [skip ci]" ]]; then envs="$e"; break; fi
done
subject="$(git log -1 --format='%s' --grep="^deploy(dev): " HEAD -- deploy/cloud/overlays/dev)"
if [[ "$subject" == *" from $FROM [skip ci]" ]]; then envs="${envs:+$envs }dev"; fi
[ -n "$envs" ] || { echo "この PR が入っている dev はありません"; exit 0; }
for e in $envs; do deploy/k8s/scripts/set-dev-replicas.sh "$e" 0; done
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git commit -am "park(${envs// /,}): ${FROM} を閉じたので止める [skip ci]" || { echo "変更なし（もう止まっている）"; exit 0; }
for _ in 1 2 3; do
  git pull --rebase origin main && git push origin HEAD:main && exit 0
  sleep 5
done
exit 1
