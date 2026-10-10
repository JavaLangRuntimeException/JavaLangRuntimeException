#!/usr/bin/env bash
# 環境のイメージの版（images の newTag）を書き換える（CI が使う。手で戻すときも同じ）。
# 各サービスの version ラベル（Datadog）とカナリアの判定に渡す version は、kustomization.yaml の replacements が
# そのサービスのイメージのタグから取るので、ここでは newTag だけを書き換えればよい。
# 使い方: scripts/set-version.sh dev01|dev02|dev03|stg|prod <tag> [サービス ...]   （サービスを省くと全部）
set -euo pipefail
ENV="${1:?usage: set-version.sh dev01|dev02|dev03|stg|prod <tag> [service ...]}"
TAG="${2:?tag}"
shift 2
cd "$(dirname "$0")/../overlays/$ENV"
DIR=.
[ "$ENV" = "prod" ] && DIR=apps
python3 - "$DIR/kustomization.yaml" "$TAG" "$@" <<'PY'
import re, sys
path, tag, services = sys.argv[1], sys.argv[2], sys.argv[3:]
s = open(path).read()
names = services or re.findall(r"newName: ghcr\.io/javalangruntimeexception/taramanji-([a-z]+),", s)
for svc in names:
    s, n = re.subn(rf"(newName: ghcr\.io/javalangruntimeexception/taramanji-{svc}, newTag: )[^ }}]+", rf"\g<1>{tag}", s)
    if n != 1:
        sys.exit(f"{svc} の images が見つかりません")
open(path, "w").write(s)
PY
echo "${ENV} → ${TAG}（${*:-全サービス}）"
