#!/usr/bin/env bash
# 環境のイメージの版を書き換える（CI が使う。手で戻すときも同じ）。
#  - images の newTag（全サービス）
#  - Pod の version ラベル（Datadog の version タグ）
#  - prod はカナリアの判定に渡す version も
# 使い方: scripts/set-version.sh dev|prod <tag>
set -euo pipefail
ENV="${1:?usage: set-version.sh dev|prod <tag>}"
TAG="${2:?tag}"
cd "$(dirname "$0")/../overlays/$ENV"
DIR=.
[ "$ENV" = "prod" ] && DIR=apps
python3 - "$DIR" "$TAG" <<'PY'
import re, sys
d, tag = sys.argv[1], sys.argv[2]
def sub(path, pattern, repl):
    s = open(path).read()
    s2 = re.sub(pattern, repl, s, flags=re.M)
    open(path, "w").write(s2)
sub(f"{d}/kustomization.yaml", r"(newName: ghcr\.io/javalangruntimeexception/taramanji-[a-z]+, newTag: )[^ }]+", rf"\g<1>{tag}")
sub(f"{d}/version.yaml", r"^(  value: ).*$", rf"\g<1>{tag}")
try:
    sub(f"{d}/rollouts.yaml", r"(- name: version\n\s+value: ).*", rf"\g<1>{tag}")
except FileNotFoundError:
    pass
PY
echo "$ENV → $TAG"
