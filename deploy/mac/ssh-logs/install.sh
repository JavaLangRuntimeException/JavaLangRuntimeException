#!/usr/bin/env bash
# sshd のログを Datadog に送る常駐プロセス（launchd の LaunchAgent）を入れる / 更新する。何度実行してもよい。
# API キーは deploy/k8s/secrets/prod/datadog-api-key（git に入らない）を ~/.config/taramanji/ に写す（表示しない）
#   bash deploy/mac/ssh-logs/install.sh
set -euo pipefail
cd "$(dirname "$0")"
LABEL=com.taramanji.ssh-logs
DEST="$HOME/Library/Application Support/taramanji/ssh-logs"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
KEY_SRC=../../k8s/secrets/prod/datadog-api-key
KEY_DST="$HOME/.config/taramanji/datadog-api-key"

mkdir -p "$DEST" "$(dirname "$KEY_DST")" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
if [ ! -f "$KEY_DST" ]; then
  [ -f "$KEY_SRC" ] || { echo "$KEY_SRC がありません（Datadog の API キー）" >&2; exit 1; }
  (umask 077 && cp "$KEY_SRC" "$KEY_DST")
fi
chmod 600 "$KEY_DST"
cp forward.py "$DEST/forward.py"
sed "s#__HOME__#$HOME#g" "$LABEL.plist" > "$PLIST"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
sleep 2
launchctl print "gui/$(id -u)/$LABEL" | grep -E "state|pid" | head -3
tail -3 "$HOME/Library/Logs/taramanji-ssh-logs.log" 2>/dev/null || true
