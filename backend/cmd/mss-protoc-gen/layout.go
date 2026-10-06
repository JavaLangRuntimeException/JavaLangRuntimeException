package main

import (
	"fmt"
	"regexp"
	"strings"

	"google.golang.org/protobuf/compiler/protogen"
)

// options は buf.gen.yaml の opt で渡すプラグイン引数。
// 何も渡さなければ従来どおり（go_module=github.com/example/manji-standard-server-go, contexts=false,
// infra=postgres, handler=rest）で、生成物は変わらない。
//
//	go_module=<Go module path>  生成コードの import パスの起点（module= は protogen の予約語なので使わない）
//	contexts=true            proto package ごとに internal/<context>/... へ出し分ける（境界づけられたコンテキスト）
//	infra=postgres|redis     Repository 実装のテンプレート（docs/patterns/infra-swap.md）
//	handler=rest|connect     ハンドラのテンプレート。connect は Connect / gRPC / gRPC-Web を 1 実装で受ける
type options struct {
	module   string
	contexts bool
	infra    string
	handler  string
}

const defaultModule = "github.com/example/manji-standard-server-go"

func (o options) validate() error {
	if o.module == "" {
		return fmt.Errorf("module must not be empty")
	}
	switch o.infra {
	case "postgres", "redis":
	default:
		return fmt.Errorf("infra must be postgres or redis, got %q", o.infra)
	}
	switch o.handler {
	case "rest", "connect":
	default:
		return fmt.Errorf("handler must be rest or connect, got %q", o.handler)
	}
	return nil
}

// layout はコンテキスト 1 つ分の出力先ディレクトリと import パス。
type layout struct {
	Context          string
	dir              string
	ImportEntity     string
	ImportRepository string
	ImportMock       string
	ImportInfraRepo  string
	ImportDTO        string
	ImportUsecase    string
	ImportHandler    string
	ImportDI         string
	ImportTx         string
	ImportErrs       string
}

func newLayout(o options, context string) layout {
	dir := "internal"
	if o.contexts && context != "" {
		dir = "internal/" + context
	}
	base := o.module + "/" + dir
	return layout{
		Context:          context,
		dir:              dir,
		ImportEntity:     base + "/domain/entity",
		ImportRepository: base + "/domain/repository",
		ImportMock:       base + "/domain/repository/mock",
		ImportInfraRepo:  base + "/infra/repository",
		ImportDTO:        base + "/dto",
		ImportUsecase:    base + "/usecase",
		ImportHandler:    base + "/handler",
		ImportDI:         base + "/di",
		ImportTx:         o.module + "/pkg/util/tx",
		ImportErrs:       o.module + "/pkg/util/errs",
	}
}

// out は internal/ 以下の相対パスを、このコンテキストの出力先に置き換える。
func (l layout) out(rel string) string {
	return l.dir + "/" + strings.TrimPrefix(rel, "internal/")
}

var versionSegment = regexp.MustCompile(`^v[0-9]+[a-z0-9]*$`)

// contextOf は proto package からコンテキスト名を決める（taramanji.worklocation.v1 → worklocation）。
func contextOf(o options, f *protogen.File) string {
	if !o.contexts {
		return ""
	}
	parts := strings.Split(string(f.Desc.Package()), ".")
	if len(parts) >= 2 && versionSegment.MatchString(parts[len(parts)-1]) {
		return parts[len(parts)-2]
	}
	return parts[len(parts)-1]
}
