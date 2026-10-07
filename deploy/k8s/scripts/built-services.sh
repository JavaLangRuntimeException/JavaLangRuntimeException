#!/usr/bin/env bash
# そのタグ（sha-xxxxxxx）のイメージが GHCR にあるサービスを空白区切りで出す（cd 用）。
# build は変わったサービスだけを作るので、イメージがある＝そのコミットで作り直したサービス
# 使い方: built-services.sh <tag>
set -euo pipefail
TAG="${1:?tag}"
REGISTRY="${REGISTRY:-ghcr.io/javalangruntimeexception}"
out=""
for s in identity notification inquiry reservation worklocation content calendarsync analytics web; do
  docker buildx imagetools inspect "$REGISTRY/taramanji-$s:$TAG" >/dev/null 2>&1 && out="$out $s"
done
echo "${out# }"
