#!/usr/bin/env bash
# 環境のイメージの版（images の newTag）を書き換える（CI が使う。手で戻すときも同じ）。
# 各サービスの version ラベル（Datadog）とカナリアの判定に渡す version は、kustomization.yaml の replacements が
# そのサービスのイメージのタグから取るので、ここでは newTag だけを書き換えればよい。
# taramanji cloud のサービス（cloud・console）は deploy/cloud/overlays/ の方を書き換える。cloud の dev は 1 つだけなので、
# dev01〜03（と dev）はどれも deploy/cloud/overlays/dev になる
# 使い方: scripts/set-version.sh dev01|dev02|dev03|dev|stg|prod <tag> [サービス ...]   （サービスを省くと、その環境の全部）
set -euo pipefail
ENV="${1:?usage: set-version.sh dev01|dev02|dev03|dev|stg|prod <tag> [service ...]}"
TAG="${2:?tag}"
shift 2
cd "$(dirname "$0")/../../.."
case "$ENV" in
  prod) K8S=deploy/k8s/overlays/prod/apps/kustomization.yaml; CLOUD=deploy/cloud/overlays/prod/app/kustomization.yaml ;;
  stg) K8S=deploy/k8s/overlays/stg/kustomization.yaml; CLOUD=deploy/cloud/overlays/stg/kustomization.yaml ;;
  dev) K8S=""; CLOUD=deploy/cloud/overlays/dev/kustomization.yaml ;;
  *) K8S="deploy/k8s/overlays/$ENV/kustomization.yaml"; CLOUD=deploy/cloud/overlays/dev/kustomization.yaml ;;
esac
python3 - "$K8S" "$CLOUD" "$TAG" "$@" <<'PY'
import os, re, sys
k8s, cloud, tag, services = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4:]
CLOUD_SERVICES = {"cloud", "console"}
pat = r"newName: ghcr\.io/javalangruntimeexception/taramanji-([a-z]+),"
files = [p for p in (k8s, cloud) if p and os.path.exists(p)]
texts = {p: open(p).read() for p in files}
if not services:
    services = [s for p in files for s in re.findall(pat, texts[p])]
for svc in services:
    path = cloud if svc in CLOUD_SERVICES else k8s
    if path not in texts:
        sys.exit(f"{svc} を書き換える kustomization.yaml がありません（{path or 'この環境は cloud だけ'}）")
    texts[path], n = re.subn(rf"(newName: ghcr\.io/javalangruntimeexception/taramanji-{svc}, newTag: )[^ }}]+", rf"\g<1>{tag}", texts[path])
    if n != 1:
        sys.exit(f"{svc} の images が見つかりません")
for p, s in texts.items():
    open(p, "w").write(s)
PY
echo "${ENV} → ${TAG}（${*:-全サービス}）"
