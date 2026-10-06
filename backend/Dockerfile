# syntax=docker/dockerfile:1.7
# 1 つの Dockerfile で全サービスを作る（docker build --build-arg SERVICE=reservation ...）。
# 実行イメージは distroless/static（シェルなし・非 root・CA 証明書とタイムゾーン入り）。GKE でも同じイメージを使う
ARG GO_VERSION=1.27

FROM --platform=$BUILDPLATFORM golang:${GO_VERSION}-alpine AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY . .
ARG SERVICE
ARG TARGETOS=linux
ARG TARGETARCH
ARG VERSION=dev
RUN test -n "$SERVICE" || (echo "--build-arg SERVICE=<name> を指定してください" && false)
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath -ldflags "-s -w -X main.version=${VERSION}" -o /out/app ./cmd/${SERVICE}

FROM gcr.io/distroless/static-debian12:nonroot
ARG SERVICE
ARG VERSION=dev
# Datadog の Unified Service Tagging（APM・ログ・メトリクスを同じ service / version で束ねる）
ENV DD_SERVICE=${SERVICE} DD_VERSION=${VERSION} TZ=Asia/Tokyo PORT=:8080
LABEL com.datadoghq.tags.service=${SERVICE} com.datadoghq.tags.version=${VERSION}
COPY --from=builder /out/app /app
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/app"]
