#!/usr/bin/env bash
# taramanji cloud をはじめて動かすための作業のうち、gh・cloudflared・kubeseal でできるものをまとめて行う。何度実行してもよい（済んだものは飛ばす）。
#
#   deploy/cloud/scripts/bootstrap.sh [Access のトークンのファイル]
#
# 行うこと:
#   1. アプリ用のリポジトリ taramanji-cloud-apps（private）を作り、環境ごとのディレクトリを置く
#   2. Argo CD が読む Deploy key（読み取りだけ）を作って登録し、SealedSecret にしてクラスターに入れる
#   3. トンネル taramanji-cloud を作り、cloud・cloud-stg・cloud-dev の DNS をトンネルに向ける（~/.cloudflared/cert.pem を使う）
#   4. Access のアプリ taramanji-cloud を作る（トークンのファイルを渡したときだけ）
#   5. Datadog のキーを taramanji のものからコピーする（なければ）
#   6. seal.sh prod / stg / dev
#
# API では作れないので、手で用意するもの（なければその部分を飛ばす。あとで置いて、もう一度実行する）:
#   - deploy/cloud/secrets/apps-repo-token: taramanji-cloud-apps だけ・Contents の Read and write だけの fine-grained PAT
#     https://github.com/settings/personal-access-tokens/new
#   - deploy/cloud/secrets/cloudflare.env: CF_DNS_API_TOKEN=（ゾーン → DNS → 編集、taramanji.com だけ）と CF_ZONE_ID=
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(git rev-parse --show-toplevel)"
CTX="${KUBE_CONTEXT:-kind-taramanji}"
ORG=JavaLangRuntimeException
REPO="$ORG/taramanji-cloud-apps"
S=secrets
mkdir -p "$S"
step() { printf '\n== %s\n' "$1"; }

step "1. アプリ用のリポジトリ $REPO"
if gh repo view "$REPO" >/dev/null 2>&1; then
  echo "  既にある"
else
  gh repo create "$REPO" --private --description "taramanji cloud のリソースの YAML（コンソールが書き、Argo CD が入れる）" >/dev/null
  W=$(mktemp -d)
  (
    cd "$W" && git init -q -b main
    for d in prod stg dev; do for k in functions apis buckets cdn databases; do mkdir -p "$d/$k" && touch "$d/$k/.gitkeep"; done; done
    printf '# taramanji-cloud-apps\n\ntaramanji cloud のリソースの Kubernetes の YAML。`<環境>/<種類>/<名前>.yaml`。仕様は %s の deploy/cloud/README.md。\n' "$ORG/JavaLangRuntimeException" > README.md
    git add -A && git commit -qm "init: 環境ごとのディレクトリ"
    git -c credential.helper='!gh auth git-credential' push -q "https://github.com/$REPO.git" main
  )
  rm -rf "$W"
  echo "  作った"
fi

step "2. Argo CD の Deploy key"
KEY="$S/apps-repo-deploy-key"
[ -f "$KEY" ] || ssh-keygen -q -t ed25519 -N "" -C argocd-cloud-apps -f "$KEY"
if gh api "repos/$REPO/keys" --jq '.[].key' | grep -qF "$(cut -d' ' -f1-2 "$KEY.pub")"; then
  echo "  登録済み"
else
  gh api "repos/$REPO/keys" -f title="argocd (kind-taramanji)" -f key="$(cat "$KEY.pub")" -F read_only=true >/dev/null
  echo "  登録した（読み取りだけ）"
fi
scripts/seal-apps-repo.sh
kubectl --context "$CTX" apply -f "$ROOT/deploy/gitops/sealed/repo-taramanji-cloud-apps.yaml"

step "3. トンネル taramanji-cloud"
if [ ! -f "$S/tunnel-cloud.json" ]; then
  if ! cloudflared tunnel info taramanji-cloud >/dev/null 2>&1; then
    cloudflared tunnel create taramanji-cloud >/dev/null
  fi
  ID=$(cloudflared tunnel list -o json | python3 -c 'import json,sys;print(next(t["id"] for t in json.load(sys.stdin) if t["name"]=="taramanji-cloud"))')
  [ -f "$HOME/.cloudflared/$ID.json" ] || { echo "  ~/.cloudflared/$ID.json がない（別のマシンで作ったトンネル）。cloudflared tunnel token で作り直す" >&2; exit 1; }
  (umask 077 && cp "$HOME/.cloudflared/$ID.json" "$S/tunnel-cloud.json")
fi
for h in cloud cloud-stg cloud-dev; do
  # 既にあればエラーになるだけ（向き先は変えない）
  cloudflared tunnel route dns taramanji-cloud "$h.taramanji.com" 2>&1 | sed 's/^/  /' | tail -1 || true
done

step "4. Access のアプリ taramanji-cloud"
if [ -n "${1:-}" ]; then
  python3 "$ROOT/deploy/cloudflare/access.py" "$1"
elif [ -f "$S/access.env" ]; then
  echo "  access.env がある（作り直すときはトークンのファイルを渡す）"
else
  echo "  飛ばした: Access のトークンのファイルを引数で渡す（権限は deploy/cloudflare/access.py の先頭）"
fi

step "5. Datadog のキー"
for k in datadog-api-key datadog-app-key; do
  if [ ! -f "$S/$k" ] && [ -f "$ROOT/deploy/k8s/secrets/prod/$k" ]; then
    (umask 077 && cp "$ROOT/deploy/k8s/secrets/prod/$k" "$S/$k")
    echo "  $k を taramanji からコピーした"
  fi
done
echo "  監視（モニター）を作るには、アプリケーションキーのスコープに monitors_read・monitors_write が要る"

step "6. SealedSecret"
missing=()
[ -f "$S/apps-repo-token" ] || missing+=("apps-repo-token（関数などを保存できない）")
[ -f "$S/cloudflare.env" ] || missing+=("cloudflare.env（DNS を自動で登録しない）")
if [ -f "$S/access.env" ]; then
  for e in prod stg dev; do scripts/seal.sh "$e"; done
  echo
  echo "できた SealedSecret: deploy/cloud/overlays/*/sealed/（コミットする）"
else
  echo "  飛ばした: access.env がない（4 を先に）"
fi
if [ ${#missing[@]} -gt 0 ]; then
  echo
  echo "まだないもの（置いてから、もう一度実行する）:"
  printf '  - %s\n' "${missing[@]}"
fi
