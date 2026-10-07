#!/usr/bin/env bash
# 本番のリリース（cd の deploy-prod 用）。前のタグから変わったサービスだけに、新しい版のタグを付ける。
#  1. 前のタグ（v*）からの差分で、変わったサービスを決める（changed-services.py。前のタグがなければ全部）
#  2. サービスごとに、このコミットから main をさかのぼって、最初に見つかったイメージ（sha-xxxxxxx）を使う
#     ＝ stg に出ているのと同じイメージ
#  3. そのイメージに版のタグ（v1.2.3）を付ける
# 標準出力に、リリースしたサービスを空白区切りで出す
# 使い方: release-images.sh <v1.2.3> <コミット>
set -euo pipefail
VERSION="${1:?version}"; SHA="${2:?commit}"
REGISTRY="${REGISTRY:-ghcr.io/javalangruntimeexception}"
cd "$(dirname "$0")"
PREV="$(git describe --tags --abbrev=0 --match 'v*' "$SHA^" 2>/dev/null || true)"
services="$(./changed-services.py --base "$PREV" --head "$SHA")"
echo "前のタグ: ${PREV:-（なし）} → リリースするサービス: ${services:-（なし）}" >&2
commits="$(git rev-list --first-parent -n 300 "$SHA")"
for s in $services; do
  src=""
  for c in $commits; do
    if docker buildx imagetools inspect "$REGISTRY/taramanji-$s:sha-${c:0:7}" >/dev/null 2>&1; then src="sha-${c:0:7}"; break; fi
  done
  [ -n "$src" ] || { echo "::error::$s のイメージが見つかりません" >&2; exit 1; }
  echo "$s: $src → $VERSION" >&2
  docker buildx imagetools create -t "$REGISTRY/taramanji-$s:$VERSION" "$REGISTRY/taramanji-$s:$src" >&2
done
echo "$services"
