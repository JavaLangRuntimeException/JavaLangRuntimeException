#!/usr/bin/env bash
# ゾーンファイルの全レコードについて、旧ネームサーバー（お名前.com）と新ネームサーバー（Cloudflare）の回答を比べる。
# お名前.com でネームサーバーを切り替える前に実行し、すべて OK になってから切り替える。
# 使い方: ./verify.sh <Cloudflare のネームサーバー 例: xxx.ns.cloudflare.com> [旧ネームサーバー]
set -uo pipefail
cd "$(dirname "$0")"
NEW="${1:?usage: $0 <new-nameserver> [old-nameserver]}"
OLD="${2:-01.dnsv.jp}"
ZONE=taramanji.com
FILE="$ZONE.zone"

grep -q "^; TODO" "$FILE" && echo "WARN: $FILE に TODO が残っています（SES の DKIM など）"

ng=0
# 名前 種類 の組を重複なく取り出す（@ は頂点）
while read -r name type; do
  fqdn=$([ "$name" = "@" ] && echo "$ZONE" || echo "$name.$ZONE")
  old=$(dig +short "$type" "$fqdn" @"$OLD" | sort | tr '\n' ' ')
  new=$(dig +short "$type" "$fqdn" @"$NEW" | sort | tr '\n' ' ')
  if [ -n "$old" ] && [ "$old" = "$new" ]; then
    printf "OK  %-6s %s\n" "$type" "$fqdn"
  else
    ng=1
    printf "NG  %-6s %s\n    旧: %s\n    新: %s\n" "$type" "$fqdn" "${old:-(なし)}" "${new:-(なし)}"
  fi
done < <(grep -vE '^\s*(;|\$|$)' "$FILE" | awk '{print $1, $4}' | sort -u)

[ $ng -eq 0 ] && echo "すべて一致しました。お名前.com でネームサーバーを $NEW などに変更して大丈夫です。" \
  || { echo "一致しないレコードがあります。Cloudflare 側を直してから再実行してください。"; exit 1; }
