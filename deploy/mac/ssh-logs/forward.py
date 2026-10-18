#!/usr/bin/python3
"""
Mac mini の sshd のログを Datadog Logs に送る（launchd で常駐。install.sh で入れる）。

macOS の sshd は統合ログ（log stream）にしか書かないので、Datadog Agent（kind の中）からは読めない。
ここで log stream を読み、1 行ずつ分類して Datadog の HTTP intake に直接送る。

送る属性（Datadog の標準属性に合わせる）:
  evt.name     authentication（認証の結果）/ session（切断）/ connection（認証前の切断など）
  evt.outcome  success / failure（authentication と認証前の切断だけ）
  usr.name     ログインしようとしたユーザー
  network.client.ip / network.client.port
  ssh.method   publickey / keyboard-interactive/pam など
  tailscale.device / tailscale.user   接続元の Tailscale の端末と持ち主（tailscale whois）

  DD_API_KEY_FILE=~/.config/taramanji/datadog-api-key /usr/bin/python3 forward.py   # 手で動かすとき
  forward.py --dry-run                                                             # 送らずに標準出力へ
"""
import json
import os
import re
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime

SITE = os.environ.get("DD_SITE", "us5.datadoghq.com")
INTAKE = f"https://http-intake.logs.{SITE}/api/v2/logs"
KEY_FILE = os.path.expanduser(os.environ.get("DD_API_KEY_FILE", "~/.config/taramanji/datadog-api-key"))
TAILSCALE = "/Applications/Tailscale.app/Contents/MacOS/Tailscale"
HOST = os.environ.get("DD_HOSTNAME", "taramanji-mac-mini")
TAGS = "env:prod,host_type:mac-mini,app:taramanji"
DRY_RUN = "--dry-run" in sys.argv

# sshd 自身が書いた行だけ（ライブラリの雑多なログは除く）
PREDICATE = 'process BEGINSWITH "sshd" AND (senderImagePath BEGINSWITH "/usr/libexec/sshd" OR senderImagePath BEGINSWITH "/usr/sbin/sshd")'

IP = r"(?P<ip>[0-9a-fA-F:.]+)"
PORT = r"port (?P<port>\d+)"
RULES = [
    # 認証に成功（= ログインできた）
    (re.compile(rf"^Accepted (?P<method>\S+) for (?P<user>\S+) from {IP} {PORT}"), "authentication", "success", "info"),
    # 認証に失敗
    (re.compile(rf"^Failed (?P<method>\S+) for (?:invalid user )?(?P<user>\S+) from {IP} {PORT}"), "authentication", "failure", "warn"),
    (re.compile(rf"^Invalid user (?P<user>\S*) from {IP} {PORT}"), "authentication", "failure", "warn"),
    (re.compile(rf"^(?:error: )?maximum authentication attempts exceeded for (?:invalid user )?(?P<user>\S+) from {IP} {PORT}"),
     "authentication", "failure", "warn"),
    # 認証が終わる前に切れた（鍵が合わず諦めた・ポートスキャンなど）
    (re.compile(rf"^(?:Connection (?:closed|reset) by|Disconnected from) (?:(?:authenticating|invalid) user (?P<user>\S+) )?{IP} {PORT} \[preauth\]"),
     "connection", "failure", "warn"),
    # ログインしていたセッションの切断
    (re.compile(rf"^(?:Disconnected from user|Received disconnect from|Connection closed by user) ?(?P<user>\S+)? {IP} {PORT}"),
     "session", None, "info"),
]

_whois = {}


def whois(ip):
    """Tailscale の IP（100.x / fd7a:）なら、端末名と持ち主を引く。失敗しても止めない"""
    if not (ip.startswith("100.") or ip.lower().startswith("fd7a:")):
        return {}
    if ip in _whois:
        return _whois[ip]
    info = {}
    try:
        out = subprocess.run([TAILSCALE, "whois", "--json", ip], capture_output=True, text=True, timeout=5).stdout
        d = json.loads(out)
        info = {"device": d["Node"].get("ComputedName") or d["Node"].get("Name", "").split(".")[0],
                "user": d.get("UserProfile", {}).get("LoginName", "")}
    except Exception:
        pass
    _whois[ip] = info
    return info


def classify(message):
    attrs = {"evt": {"name": "sshd"}}
    status = "info"
    for rx, name, outcome, st in RULES:
        m = rx.search(message)
        if not m:
            continue
        g = m.groupdict()
        attrs["evt"] = {"name": name}
        if outcome:
            attrs["evt"]["outcome"] = outcome
        if g.get("user"):
            attrs["usr"] = {"name": g["user"]}
        attrs["network"] = {"client": {"ip": g["ip"], "port": int(g["port"])}}
        if g.get("method"):
            attrs["ssh"] = {"method": g["method"]}
        ts = whois(g["ip"])
        if ts:
            attrs["tailscale"] = ts
        status = st
        break
    if message.startswith("error:") and status == "info":
        status = "error"
    return attrs, status


def epoch_ms(ts):
    """log stream の時刻（2026-10-18 22:22:31.197102+0900）を Datadog が読めるミリ秒に"""
    try:
        return int(datetime.strptime(ts, "%Y-%m-%d %H:%M:%S.%f%z").timestamp() * 1000)
    except ValueError:
        return int(time.time() * 1000)


def load_key():
    try:
        return open(KEY_FILE).read().strip()
    except OSError:
        sys.exit(f"{KEY_FILE} がない（Datadog の API キーを置く。install.sh 参照）")


def send(key, entries):
    body = json.dumps(entries).encode()
    for attempt in range(5):
        req = urllib.request.Request(INTAKE, data=body, method="POST",
                                     headers={"DD-API-KEY": key, "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=15):
                return
        except (urllib.error.URLError, OSError) as e:
            print(f"Datadog への送信に失敗（{attempt + 1} 回目）: {e}", file=sys.stderr, flush=True)
            time.sleep(2 ** attempt)


def main():
    key = None if DRY_RUN else load_key()
    cmd = ["/usr/bin/log", "stream", "--info", "--style", "ndjson", "--predicate", PREDICATE]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, text=True)
    print("log stream を読み始めた", file=sys.stderr, flush=True)
    for line in proc.stdout:
        try:
            ev = json.loads(line)
        except ValueError:
            continue  # 先頭の「Filtering the log data using …」など
        msg = ev.get("eventMessage") or ""
        if not msg:
            continue
        attrs, status = classify(msg)
        entry = {
            "ddsource": "sshd", "service": "ssh", "hostname": HOST, "ddtags": TAGS,
            "message": msg, "status": status,
            "date": epoch_ms(ev.get("timestamp", "")),
            "process": {"name": os.path.basename(ev.get("processImagePath", "")), "pid": ev.get("processID")},
            **attrs,
        }
        if DRY_RUN:
            print(json.dumps(entry, ensure_ascii=False), flush=True)
        else:
            send(key, [entry])
    # log stream が終わったら launchd に再起動してもらう
    sys.exit(proc.wait() or 1)


if __name__ == "__main__":
    socket.setdefaulttimeout(20)
    main()
