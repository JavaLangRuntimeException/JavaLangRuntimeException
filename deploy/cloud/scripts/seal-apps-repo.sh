#!/usr/bin/env bash
# アプリ用のリポジトリ（taramanji-cloud-apps）を Argo CD が読むための Deploy key を SealedSecret にする。
#   ssh-keygen -t ed25519 -N "" -C argocd-cloud-apps -f deploy/cloud/secrets/apps-repo-deploy-key
#   → 公開鍵（.pub）を GitHub のリポジトリの Settings → Deploy keys に「読み取りだけ」で登録する
#   deploy/cloud/scripts/seal-apps-repo.sh && kubectl apply -f deploy/gitops/sealed/repo-taramanji-cloud-apps.yaml
set -euo pipefail
cd "$(dirname "$0")/.."
CTX="${KUBE_CONTEXT:-kind-taramanji}"
KEY=secrets/apps-repo-deploy-key
OUT=../gitops/sealed/repo-taramanji-cloud-apps.yaml
REPO="${APPS_REPO_URL:-git@github.com:JavaLangRuntimeException/taramanji-cloud-apps.git}"
[ -f "$KEY" ] || { echo "$KEY がない（上の ssh-keygen を先に実行する）" >&2; exit 1; }

kubectl create secret generic repo-taramanji-cloud-apps -n argocd \
  --from-literal=type=git --from-literal=url="$REPO" --from-file=sshPrivateKey="$KEY" --dry-run=client -o json \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); d["metadata"]["labels"]={"argocd.argoproj.io/secret-type":"repository"}; json.dump(d,sys.stdout)' \
  | kubeseal --context "$CTX" --controller-namespace kube-system --format yaml > "$OUT"
echo "  $OUT"
