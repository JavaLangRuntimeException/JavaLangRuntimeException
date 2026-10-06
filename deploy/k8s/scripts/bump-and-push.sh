#!/usr/bin/env bash
# 環境の版を書き換えて main にコミットする（CI 用）。Argo CD がそのコミットを見て同期する。
# 使い方: bump-and-push.sh dev|stg|prod <tag> [どこから（PR の URL やブランチ名）]
set -euo pipefail
ENV="$1"; TAG="$2"; FROM="${3:-}"
cd "$(dirname "$0")/../../.."
deploy/k8s/scripts/set-version.sh "$ENV" "$TAG"
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git commit -am "deploy($ENV): $TAG${FROM:+ from $FROM} [skip ci]" || { echo "変更なし"; exit 0; }
# 他のジョブが先に main を進めていたら取り込んでから push する
for i in 1 2 3; do
  git pull --rebase origin main && git push origin HEAD:main && exit 0
  sleep 5
done
exit 1
