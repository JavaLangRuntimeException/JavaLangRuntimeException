#!/usr/bin/env bash
# Cloudflare に taramanji.com のゾーンを作り（Free プラン）、taramanji.com.zone のレコードを取り込む。
# 取り込むレコードはすべてプロキシなし（DNS のみ）。Vercel の証明書発行やメールに影響させないため。
# 必要な環境変数:
#   CLOUDFLARE_API_TOKEN  権限: Zone:Edit, DNS:Edit（対象アカウントのすべてのゾーン）
#   CLOUDFLARE_ACCOUNT_ID ダッシュボードの右側に表示されるアカウント ID
set -euo pipefail
cd "$(dirname "$0")"
ZONE=taramanji.com
API=https://api.cloudflare.com/client/v4
: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN を設定してください}"
: "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID を設定してください}"
auth=(-H "Authorization: Bearer $CLOUDFLARE_API_TOKEN")
json() { python3 -c "import json,sys; d=json.load(sys.stdin); $1"; }

if grep -q "^; TODO" "$ZONE.zone"; then
  echo "$ZONE.zone に TODO が残っています（SES の DKIM など）。追記してから実行してください。" >&2
  exit 1
fi

id=$(curl -sS "${auth[@]}" "$API/zones?name=$ZONE" | json 'print(d["result"][0]["id"] if d["result"] else "")')
if [ -z "$id" ]; then
  id=$(curl -sS "${auth[@]}" -H "Content-Type: application/json" -X POST "$API/zones" \
    -d "{\"name\":\"$ZONE\",\"account\":{\"id\":\"$CLOUDFLARE_ACCOUNT_ID\"},\"type\":\"full\"}" \
    | json 'assert d["success"], d["errors"]; print(d["result"]["id"])')
  echo "ゾーンを作成しました: $id"
fi

# 既にあるレコードは Cloudflare 側で重複としてスキップされる
curl -sS "${auth[@]}" -X POST "$API/zones/$id/dns_records/import" \
  -F "file=@$ZONE.zone" -F "proxied=false" \
  | json 'print("取り込み:", d["result"] if d["success"] else d["errors"])'

echo "--- Cloudflare 側のレコード"
curl -sS "${auth[@]}" "$API/zones/$id/dns_records?per_page=100" \
  | json '[print(f"{r[\"type\"]:6} {r[\"name\"]:40} {r[\"content\"][:60]} proxied={r[\"proxied\"]}") for r in d["result"]]'
echo "--- お名前.com で設定するネームサーバー"
curl -sS "${auth[@]}" "$API/zones/$id" | json 'print("\n".join(d["result"]["name_servers"]))'
