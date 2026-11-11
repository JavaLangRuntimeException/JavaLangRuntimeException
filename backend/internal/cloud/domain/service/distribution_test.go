package service

import (
	"reflect"
	"strings"
	"testing"
)

// パスごとの元（behavior）: /api は関数、/assets は 1 年キャッシュのバケット、それ以外（/）は SPA のバケット
func TestDistributionBehaviors(t *testing.T) {
	s := DistributionSpec{Name: "vrst", OriginType: OriginBucket, Origin: "front", CacheSeconds: 300, SPA: true,
		Behaviors: []DistributionOrigin{
			{Path: "/assets/", OriginType: OriginBucket, Origin: "front", CacheSeconds: MaxCacheSeconds},
			{Path: " /api ", OriginType: OriginFunction, Origin: "backend"},
		}}
	if err := s.Normalize().Validate(); err != nil {
		t.Fatal(err)
	}
	y, err := RenderDistributionYAML(s, target)
	if err != nil {
		t.Fatal(err)
	}
	// 長いパスが先、最後が既定の /
	var r k8sHTTPRoute
	if n, err := decodeKind(y, "HTTPRoute", &r); err != nil || n != 1 {
		t.Fatal(err)
	}
	var paths []string
	for _, rule := range r.Spec.Rules {
		paths = append(paths, rule.Matches[0].Path.Value)
	}
	if !reflect.DeepEqual(paths, []string{"/assets", "/api", "/"}) {
		t.Fatalf("順番 %v", paths)
	}
	// /api のルールは関数へ（バケットのヘッダーは消す）。キャッシュしない
	api := r.Spec.Rules[1].Filters[0].RequestHeaderModifier
	if api.Set[0] != (headerValue{Name: HeaderFunction, Value: "backend"}) || api.Set[1].Value != "0" || api.Remove[0] != HeaderBucket {
		t.Fatalf("/api: %+v", api)
	}

	// 読み戻すと同じ定義（フォームで直せる）
	p, err := ParseDistributionYAML("vrst", y, target)
	if err != nil || !p.FormEditable || !reflect.DeepEqual(p.Spec, s.Normalize()) {
		t.Fatalf("読み戻し: %+v %v", p, err)
	}
	if got := p.Spec.Uses(OriginBucket); !reflect.DeepEqual(got, []string{"front"}) {
		t.Fatalf("uses bucket %v", got)
	}
	if got := p.Spec.Uses(OriginFunction); !reflect.DeepEqual(got, []string{"backend"}) {
		t.Fatalf("uses function %v", got)
	}

	// 既定の / がない・順番を変えた YAML は通さない
	noDefault := strings.Replace(y, "value: /\n", "value: /x\n", 1)
	if _, err := ParseDistributionYAML("vrst", noDefault, target); noDefault == y || err == nil {
		t.Error("/ のルールがない YAML は通さない")
	}

	for name, bad := range map[string][]DistributionOrigin{
		"/ を behavior に":   {{Path: "/", OriginType: OriginBucket, Origin: "front"}},
		"パスの重複":            {{Path: "/api", OriginType: OriginFunction, Origin: "a"}, {Path: "/api/", OriginType: OriginFunction, Origin: "b"}},
		"使えない文字":           {{Path: "/a b", OriginType: OriginFunction, Origin: "a"}},
		"..":               {{Path: "/a/../b", OriginType: OriginFunction, Origin: "a"}},
		"/ で始まらない":         {{Path: "api", OriginType: OriginFunction, Origin: "a"}},
		"元なし":              {{Path: "/api", OriginType: OriginFunction}},
		"関数に SPA":          {{Path: "/api", OriginType: OriginFunction, Origin: "a", SPA: true}},
		"長すぎるキャッシュ":        {{Path: "/api", OriginType: OriginFunction, Origin: "a", CacheSeconds: MaxCacheSeconds + 1}},
		"16 個（既定と合わせて 17）": make16(),
	} {
		spec := DistributionSpec{Name: "vrst", OriginType: OriginBucket, Origin: "front", Behaviors: bad}
		if err := spec.Normalize().Validate(); err == nil {
			t.Errorf("%s は通さない", name)
		} else if fe, ok := err.(*FieldError); !ok || fe.Field != "behaviors" {
			t.Errorf("%s: 欄 %v", name, err)
		}
	}
	// 15 個までは置ける
	ok := DistributionSpec{Name: "vrst", OriginType: OriginBucket, Origin: "front", Behaviors: make16()[:MaxBehaviors]}
	if err := ok.Normalize().Validate(); err != nil {
		t.Fatal(err)
	}
}

func make16() []DistributionOrigin {
	out := make([]DistributionOrigin, 16)
	for i := range out {
		out[i] = DistributionOrigin{Path: "/p" + string(rune('a'+i)), OriginType: OriginFunction, Origin: "fn"}
	}
	return out
}
