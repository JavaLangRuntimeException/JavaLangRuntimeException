#!/usr/bin/env python3
"""
変わったファイルから、イメージを作り直す（＝入れ替える）サービスを決める。

  changed-services.py --base <sha> --head <sha>   # git の差分から
  changed-services.py --files a.go b.tsx ...      # ファイルを直接渡す（テスト用）

出力: 対象のサービス名を空白区切りで 1 行（なければ空行）。

Go のサービスは、Go の依存関係（go list -deps）で決めるので、共通部分（backend/pkg・生成コードなど）を
変えたときも、それを使っている全サービスが対象になる（取りこぼさない）。
判断できないファイル（go.mod・Dockerfile・ワークフローなど）は、安全側に倒して全部を対象にする。
"""
import argparse
import os
import subprocess
import sys

GO_SERVICES = ["identity", "notification", "inquiry", "reservation", "worklocation", "content", "calendarsync", "analytics"]
ALL = GO_SERVICES + ["web"]
ROOT = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True).stdout.strip()
BACKEND = os.path.join(ROOT, "backend")

# イメージの中身に関係しないファイル（変えてもビルドし直さない）
DOC_NAMES = ("README.md", "CLAUDE.md", "AGENTS.md")
DOC_DIRS = ("backend/.claude/", "backend/docs/", "frontend/.claude/", "frontend/.cursor/")
# イメージの作り方そのもの。変わったら全部作り直す
BUILD_FILES = (".github/workflows/build.yml",)


def go_deps():
    """サービスごとに、使っている backend 内のディレクトリ（相対パス）の集合"""
    deps = {}
    for svc in GO_SERVICES:
        out = subprocess.run(["go", "list", "-deps", "-f", "{{.Dir}}", f"./cmd/{svc}"], cwd=BACKEND,
                             capture_output=True, text=True, check=True).stdout
        deps[svc] = {os.path.relpath(d, ROOT) for d in out.split() if d.startswith(BACKEND + os.sep)}
    return deps


def services_for(files):
    hit = set()
    deps = None
    for f in files:
        if os.path.basename(f) in DOC_NAMES or f.startswith(DOC_DIRS):
            continue
        if f in BUILD_FILES:
            return list(ALL)
        if f.startswith("frontend/"):
            hit.add("web")
            continue
        if not f.startswith("backend/"):
            continue  # マニフェスト・ドキュメント・ほかのワークフローなどはイメージに入らない
        if f.endswith("_test.go"):
            continue  # テストは実行ファイルに入らない
        parts = f.split("/")
        # backend/internal/<svc>/... と backend/cmd/<svc>/... はそのサービス（Go 以外のファイルも含めて）
        if len(parts) > 2 and parts[1] in ("internal", "cmd") and parts[2] in GO_SERVICES:
            hit.add(parts[2])
        if f.endswith(".go"):
            if deps is None:
                deps = go_deps()
            d = os.path.dirname(f)
            users = [svc for svc in GO_SERVICES if d in deps[svc]]
            if users:
                hit.update(users)
                continue
            if len(parts) > 2 and parts[1] in ("internal", "cmd") and parts[2] in GO_SERVICES:
                continue
            if len(parts) > 2 and parts[1] == "cmd":
                continue  # ほかのツール（mss-protoc-gen など）。生成結果が変われば gen/ や internal/ の差分で拾う
        elif len(parts) > 2 and parts[1] in ("internal", "cmd") and parts[2] in GO_SERVICES:
            continue
        # go.mod・Dockerfile・どのサービスも使っていない Go のファイルなど、判断できないものは全部
        hit.update(GO_SERVICES)
    return [s for s in ALL if s in hit]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base")
    ap.add_argument("--head", default="HEAD")
    ap.add_argument("--files", nargs="*")
    a = ap.parse_args()
    if a.files is not None:
        files = a.files
    else:
        if not a.base or set(a.base) == {"0"}:
            print(" ".join(ALL))  # 比べる相手がない（新しいブランチの最初の push など）ときは全部
            return
        files = subprocess.run(["git", "diff", "--name-only", a.base, a.head], cwd=ROOT,
                               capture_output=True, text=True, check=True).stdout.split()
    print(" ".join(services_for(files)))


if __name__ == "__main__":
    sys.exit(main())
