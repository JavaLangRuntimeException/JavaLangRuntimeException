package main

import (
	"fmt"
	"strings"

	"google.golang.org/protobuf/compiler/protogen"
	"google.golang.org/protobuf/reflect/protoreflect"
)

// tplConnect は handler=connect のときに Handler / DI テンプレートへ渡す追加データ。
// pb（protoc-gen-go）の型と usecase の Input / Output 型の相互変換コードはここで組み立て、
// テンプレートは組み立て済みの式を並べるだけにする。
type tplConnect struct {
	PbImport      string
	PbPkg         string
	ConnectImport string
	ConnectPkg    string
	ServiceGoName string
	Methods       []tplConnectMethod
	Converters    []string
	UsesDTO       bool
}

type tplConnectMethod struct {
	Name         string
	ReqType      string
	ResType      string
	InputAssigns []string
	Response     string // out（usecase の戻り値）から *pb.Res を作る式
	ReturnsEmpty bool
}

type converterBuilder struct {
	prefix   string
	pbPkg    string
	pbImport protogen.GoImportPath
	names    map[protoreflect.FullName]string
	entities map[protoreflect.FullName]*entitySpec
	done     map[string]bool
	funcs    []string
	err      error
}

func (b *converterBuilder) fail(format string, args ...any) string {
	if b.err == nil {
		b.err = fmt.Errorf(format, args...)
	}
	return "nil"
}

func (b *converterBuilder) usecaseName(msg *protogen.Message) string {
	if n, ok := b.names[msg.Desc.FullName()]; ok {
		return n
	}
	return msg.GoIdent.GoName
}

func (b *converterBuilder) pbType(msg *protogen.Message) string {
	if msg.GoIdent.GoImportPath != b.pbImport {
		b.fail("message %s is in another Go package (%s); handler=connect supports messages of the same package only", msg.Desc.FullName(), msg.GoIdent.GoImportPath)
	}
	return b.pbPkg + "." + msg.GoIdent.GoName
}

func (b *converterBuilder) toUsecaseFn(msg *protogen.Message) string {
	b.ensure(msg)
	return b.prefix + "PbTo" + b.usecaseName(msg)
}

func (b *converterBuilder) toPbFn(msg *protogen.Message) string {
	b.ensure(msg)
	return b.prefix + b.usecaseName(msg) + "ToPb"
}

func scalarGo(f *protogen.Field) string {
	t := goTypeFromKind(f, nil)
	return strings.TrimPrefix(t, "[]")
}

// toUsecase は pb 側の式 src を usecase 側の値に変換する式を返す。
func (b *converterBuilder) toUsecase(f *protogen.Field, src string) string {
	switch {
	case f.Desc.IsMap():
		key, val := f.Message.Fields[0], f.Message.Fields[1]
		if val.Desc.Kind() == protoreflect.MessageKind {
			if _, isEntity := b.entities[val.Message.Desc.FullName()]; isEntity {
				return b.fail("field %s: map of @entity is not supported by handler=connect", f.Desc.FullName())
			}
			u := "usecase." + b.usecaseName(val.Message)
			return fmt.Sprintf("func(m map[%s]*%s) map[%s]*%s { if m == nil { return nil }; out := make(map[%s]*%s, len(m)); for k, v := range m { out[k] = %s(v) }; return out }(%s)",
				scalarGo(key), b.pbType(val.Message), scalarGo(key), u, scalarGo(key), u, b.toUsecaseFn(val.Message), src)
		}
		return src
	case f.Desc.Kind() == protoreflect.MessageKind:
		if _, isEntity := b.entities[f.Message.Desc.FullName()]; isEntity {
			return b.fail("field %s: @entity as rpc input is not supported by handler=connect (use a *Params message)", f.Desc.FullName())
		}
		u := "usecase." + b.usecaseName(f.Message)
		if f.Desc.IsList() {
			return fmt.Sprintf("func(l []*%s) []*%s { if l == nil { return nil }; out := make([]*%s, 0, len(l)); for _, v := range l { out = append(out, %s(v)) }; return out }(%s)",
				b.pbType(f.Message), u, u, b.toUsecaseFn(f.Message), src)
		}
		return fmt.Sprintf("%s(%s)", b.toUsecaseFn(f.Message), src)
	case f.Desc.Kind() == protoreflect.EnumKind:
		return b.fail("field %s: enum is not supported by handler=connect", f.Desc.FullName())
	default:
		return src
	}
}

// toPb は usecase 側の式 src を pb 側の値に変換する式を返す。
func (b *converterBuilder) toPb(f *protogen.Field, src string) string {
	switch {
	case f.Desc.IsMap():
		key, val := f.Message.Fields[0], f.Message.Fields[1]
		if val.Desc.Kind() == protoreflect.MessageKind {
			if _, isEntity := b.entities[val.Message.Desc.FullName()]; isEntity {
				return b.fail("field %s: map of @entity is not supported by handler=connect", f.Desc.FullName())
			}
			p := b.pbType(val.Message)
			return fmt.Sprintf("func(m map[%s]*usecase.%s) map[%s]*%s { if m == nil { return nil }; out := make(map[%s]*%s, len(m)); for k, v := range m { out[k] = %s(v) }; return out }(%s)",
				scalarGo(key), b.usecaseName(val.Message), scalarGo(key), p, scalarGo(key), p, b.toPbFn(val.Message), src)
		}
		return src
	case f.Desc.Kind() == protoreflect.MessageKind:
		if _, isEntity := b.entities[f.Message.Desc.FullName()]; isEntity {
			return b.fail("field %s: @entity inside an Output is not supported by handler=connect (return a non-entity message)", f.Desc.FullName())
		}
		p := b.pbType(f.Message)
		if f.Desc.IsList() {
			return fmt.Sprintf("func(l []*usecase.%s) []*%s { if l == nil { return nil }; out := make([]*%s, 0, len(l)); for _, v := range l { out = append(out, %s(v)) }; return out }(%s)",
				b.usecaseName(f.Message), p, p, b.toPbFn(f.Message), src)
		}
		return fmt.Sprintf("%s(%s)", b.toPbFn(f.Message), src)
	case f.Desc.Kind() == protoreflect.EnumKind:
		return b.fail("field %s: enum is not supported by handler=connect", f.Desc.FullName())
	case f.Desc.HasPresence() && !f.Desc.IsList():
		// proto3 optional のスカラーは pb 側がポインタ
		return fmt.Sprintf("func(v %s) *%s { return &v }(%s)", scalarGo(f), scalarGo(f), src)
	default:
		return src
	}
}

// ensure は非 entity message 1 つ分の相互変換関数を生成する（再帰する message にも対応）。
func (b *converterBuilder) ensure(msg *protogen.Message) {
	name := b.usecaseName(msg)
	if b.done[name] {
		return
	}
	b.done[name] = true
	pbT := b.pbType(msg)
	var toU, toP strings.Builder
	fmt.Fprintf(&toU, "func %sPbTo%s(p *%s) *usecase.%s {\n\tif p == nil {\n\t\treturn nil\n\t}\n\treturn &usecase.%s{\n", b.prefix, name, pbT, name, name)
	fmt.Fprintf(&toP, "func %s%sToPb(u *usecase.%s) *%s {\n\tif u == nil {\n\t\treturn nil\n\t}\n\treturn &%s{\n", b.prefix, name, name, pbT, pbT)
	for _, f := range msg.Fields {
		fmt.Fprintf(&toU, "\t\t%s: %s,\n", normalizeInitialisms(f.GoName), b.toUsecase(f, "p.Get"+f.GoName+"()"))
		fmt.Fprintf(&toP, "\t\t%s: %s,\n", f.GoName, b.toPb(f, "u."+normalizeInitialisms(f.GoName)))
	}
	toU.WriteString("\t}\n}")
	toP.WriteString("\t}\n}")
	b.funcs = append(b.funcs, toU.String(), toP.String())
}

func (b *converterBuilder) entityToPbFn(e *entitySpec, msg *protogen.Message) string {
	fn := b.prefix + e.Name + "DTOToPb"
	if b.done[fn] {
		return fn
	}
	b.done[fn] = true
	pbT := b.pbType(msg)
	var s strings.Builder
	fmt.Fprintf(&s, "func %s(d *dto.%sDTO) *%s {\n\tif d == nil {\n\t\treturn nil\n\t}\n\treturn &%s{\n", fn, e.Name, pbT, pbT)
	for _, f := range e.Fields {
		dtoField := f.GoName
		if f.IsTimestamp {
			dtoField += "Unix"
		}
		fmt.Fprintf(&s, "\t\t%s: d.%s,\n", f.PbFieldGo, dtoField)
	}
	s.WriteString("\t}\n}")
	b.funcs = append(b.funcs, s.String())
	return fn
}

// addConnectData は buildServiceTpl の結果に Connect 用の変換コードを足す。
func addConnectData(s *tplService, svc *protogen.Service, f *protogen.File, entities map[protoreflect.FullName]*entitySpec) error {
	pbPkg := string(f.GoPackageName)
	c := &tplConnect{
		PbImport:      string(f.GoImportPath),
		PbPkg:         pbPkg,
		ConnectPkg:    pbPkg + "connect",
		ConnectImport: string(f.GoImportPath) + "/" + pbPkg + "connect",
		ServiceGoName: svc.GoName,
	}
	b := &converterBuilder{
		prefix:   lowerFirst(strings.TrimSuffix(svc.GoName, "Service")),
		pbPkg:    pbPkg,
		pbImport: f.GoImportPath,
		names:    s.nonEntityNames,
		entities: entities,
		done:     map[string]bool{},
	}
	for i, m := range svc.Methods {
		tm := s.Methods[i]
		cm := tplConnectMethod{
			Name:         m.GoName,
			ReqType:      b.pbType(m.Input),
			ResType:      b.pbType(m.Output),
			ReturnsEmpty: tm.ReturnsEmpty,
		}
		for _, rf := range m.Input.Fields {
			cm.InputAssigns = append(cm.InputAssigns, fmt.Sprintf("%s: %s,", normalizeInitialisms(rf.GoName), b.toUsecase(rf, "req.Msg.Get"+rf.GoName+"()")))
		}
		switch {
		case tm.ReturnsEmpty:
			cm.Response = fmt.Sprintf("&%s{}", cm.ResType)
		case tm.ReturnsEntity || tm.ReturnsList:
			resField := m.Output.Fields[0]
			e := entities[resField.Message.Desc.FullName()]
			fn := b.entityToPbFn(e, resField.Message)
			c.UsesDTO = true
			if tm.ReturnsList {
				pbT := b.pbType(resField.Message)
				cm.Response = fmt.Sprintf("&%s{%s: func(l []*dto.%sDTO) []*%s { out := make([]*%s, 0, len(l)); for _, v := range l { out = append(out, %s(v)) }; return out }(out)}",
					cm.ResType, resField.GoName, e.Name, pbT, pbT, fn)
			} else {
				cm.Response = fmt.Sprintf("&%s{%s: %s(out)}", cm.ResType, resField.GoName, fn)
			}
		default:
			var parts []string
			for _, of := range m.Output.Fields {
				parts = append(parts, fmt.Sprintf("%s: %s", of.GoName, b.toPb(of, "out."+normalizeInitialisms(of.GoName))))
			}
			cm.Response = fmt.Sprintf("&%s{%s}", cm.ResType, strings.Join(parts, ", "))
		}
		c.Methods = append(c.Methods, cm)
	}
	if b.err != nil {
		return b.err
	}
	c.Converters = b.funcs
	s.Connect = c
	return nil
}
