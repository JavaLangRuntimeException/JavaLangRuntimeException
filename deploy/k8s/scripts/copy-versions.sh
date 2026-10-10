#!/usr/bin/env bash
# ある環境のイメージの版（images の newTag）を、別の環境へ全サービス分写す（cd 用）。
# dev に出すとき、まず stg（main の最新）の版にそろえてから、その PR で作り直したサービスだけを書き換える。
# こうすると、前にその devN を使っていた PR の版が残らない
# 使い方: copy-versions.sh <写す元: stg など> <写す先: dev01 など>
set -euo pipefail
FROM="${1:?usage: copy-versions.sh <from env> <to env>}"
TO="${2:?to env}"
cd "$(dirname "$0")/../overlays"
path() { if [ "$1" = prod ]; then echo "$1/apps/kustomization.yaml"; else echo "$1/kustomization.yaml"; fi; }
python3 - "$(path "$FROM")" "$(path "$TO")" <<'PY'
import re, sys
src, dst = sys.argv[1], sys.argv[2]
pat = r"(newName: ghcr\.io/javalangruntimeexception/taramanji-([a-z]+), newTag: )([^ }]+)"
tags = {m.group(2): m.group(3) for m in re.finditer(pat, open(src).read())}
s = open(dst).read()
s, n = re.subn(pat, lambda m: m.group(1) + tags[m.group(2)], s)
if n != len(tags):
    sys.exit(f"{dst} の images が {n} 件（{src} は {len(tags)} 件）")
open(dst, "w").write(s)
PY
echo "${FROM} → ${TO}（全サービスの版）"
