SHELL := /bin/bash

BUF_VERSION := v1.45.0

.DEFAULT_GOAL := help
# サービス一覧（cmd/ 以下。mss-protoc-gen はコード生成ツールなので除く）
SERVICES := $(filter-out mss-protoc-gen,$(notdir $(wildcard cmd/*)))
REGISTRY ?= ghcr.io/javalangruntimeexception
VERSION  ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo dev)

.PHONY: help build run test lint fmt tidy docker-build docker-push clean \
        install-tools proto-gen proto-clean

help: ## ターゲット一覧
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[32m%-14s\033[0m %s\n", $$1, $$2}'

build: ## 全サービスのバイナリをビルド（bin/<service>）
	@for s in $(SERVICES); do go build -o bin/$$s ./cmd/$$s || exit 1; done

run: ## 1 サービスをローカル起動（make run SERVICE=reservation）
	go run ./cmd/$(SERVICE)

test: ## テスト実行
	go test ./...

lint: ## Lint（go vet）
	go vet ./...

fmt: ## フォーマット
	gofmt -w .

tidy: ## go.sum 整理
	go mod tidy

install-tools: ## buf・protoc-gen-go・protoc-gen-connect-go（go.mod と同じ版）・mss-protoc-gen をインストール
	go install github.com/bufbuild/buf/cmd/buf@$(BUF_VERSION)
	go install google.golang.org/protobuf/cmd/protoc-gen-go
	go install connectrpc.com/connect/cmd/protoc-gen-connect-go
	go install ./cmd/mss-protoc-gen

proto-gen: ## proto から Go コードを生成（gen/ 配下）
	PATH="$$(go env GOPATH)/bin:$$PATH" buf generate
	gofmt -w .

proto-clean: ## 生成コードを削除
	rm -rf gen/

docker-build: ## 全サービスのイメージを手元でビルド（$(REGISTRY)/taramanji-<service>:$(VERSION)。push は CI の build がする）
	@for s in $(SERVICES); do \
		docker build --build-arg SERVICE=$$s --build-arg VERSION=$(VERSION) -t $(REGISTRY)/taramanji-$$s:$(VERSION) . || exit 1; \
	done

clean: ## ビルド成果物削除
	rm -rf bin/
