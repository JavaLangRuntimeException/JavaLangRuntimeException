#!/usr/bin/env bash
# changed-services.py のテスト（CI の test で実行）。
# 「変わったファイル → 作り直すサービス」の判定が、共通部分を変えたときに取りこぼさないことを確かめる。
set -euo pipefail
cd "$(dirname "$0")"
GO_ALL="identity notification inquiry reservation worklocation content calendarsync analytics"
ALL="$GO_ALL web"
fail=0

check() {
  local want="$1"; shift
  local got
  got="$(./changed-services.py --files "$@")"
  if [ "$got" = "$want" ]; then
    echo "ok   $* -> ${got:-（なし）}"
  else
    echo "FAIL $* -> '${got}'（期待: '${want}'）"; fail=1
  fi
}

# 1 つのサービスだけ
check "reservation"            backend/internal/reservation/usecase/reservation_usecase.go
check "identity"               backend/internal/identity/domain/service/login.go
check "calendarsync"           backend/cmd/calendarsync/main.go
check "web"                    frontend/src/main.tsx
check "web"                    frontend/package.json

# 共通部分 → 使っているサービスを全部（取りこぼさない）
check "$GO_ALL"                backend/pkg/util/server/server.go
check "$GO_ALL"                backend/go.mod
check "$GO_ALL"                backend/go.sum
check "$GO_ALL"                backend/Dockerfile
check "$GO_ALL"                backend/proto/taramanji/notification/v1/notification.proto
# 生成された gRPC のコード → そのサービスと、呼び出している側
check "notification inquiry"   backend/gen/taramanji/notification/v1/notification.pb.go
check "reservation worklocation" backend/gen/taramanji/worklocation/v1/worklocation.pb.go
# どのサービスも使っていない新しいパッケージ → 判断できないので全部
check "$GO_ALL"                backend/pkg/brand-new-package/x.go
# イメージの作り方が変わった → 全部
check "$ALL"                   .github/workflows/build.yml

# 組み合わせ
check "reservation web"        backend/internal/reservation/usecase/reservation_usecase.go frontend/src/main.tsx
check "$GO_ALL web"            backend/pkg/util/server/server.go frontend/src/main.tsx

# イメージに関係しない → なし
check ""                       README.md
check ""                       backend/README.md
check ""                       backend/internal/content/usecase/content_usecase_test.go
check ""                       deploy/k8s/overlays/prod/apps/rollouts.yaml
check ""                       .github/workflows/cd.yml
check ""                       frontend/CLAUDE.md

exit $fail
