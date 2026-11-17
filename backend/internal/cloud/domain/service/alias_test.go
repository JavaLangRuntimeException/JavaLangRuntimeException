package service

import (
	"reflect"
	"strings"
	"testing"
)

func TestDistributionAliases(t *testing.T) {
	zt := target
	zt.AliasZone = "taramanji.com"
	s := DistributionSpec{Name: "vrst", OriginType: OriginBucket, Origin: "front", Aliases: []string{" QA.taramanji.com. ", "docs.taramanji.com"}}.Normalize()
	if !reflect.DeepEqual(s.Aliases, []string{"docs.taramanji.com", "qa.taramanji.com"}) {
		t.Fatalf("normalize: %v", s.Aliases)
	}
	if err := s.ValidateAliases(zt); err != nil {
		t.Fatal(err)
	}
	y, err := RenderDistributionYAML(s, zt)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(y, "- vrst-cdn-cloud.taramanji.com\n    - docs.taramanji.com\n    - qa.taramanji.com") {
		t.Fatalf("hostnames:\n%s", y)
	}
	p, err := ParseDistributionYAML("vrst", y, zt)
	if err != nil || !reflect.DeepEqual(p.Spec, s) || !reflect.DeepEqual(p.Spec.Hosts(zt), []string{"vrst-cdn-cloud.taramanji.com", "docs.taramanji.com", "qa.taramanji.com"}) {
		t.Fatalf("読み戻し: %+v %v", p, err)
	}
	// 独自ドメインを使えない環境（ゾーンなし）では、作れないし読めない
	if _, err := RenderDistributionYAML(s, target); err == nil {
		t.Error("ゾーンがないのに作れてしまう")
	}
	if _, err := ParseDistributionYAML("vrst", y, target); err == nil {
		t.Error("ゾーンがないのに読めてしまう")
	}

	for _, bad := range []string{
		"taramanji.com", "www.taramanji.com", "gws.taramanji.com", "rollouts.taramanji.com", "cloud.taramanji.com", "cloud-x.taramanji.com",
		"x-cdn-cloud.taramanji.com", "x-apigw-cloud.taramanji.com", "a.b.taramanji.com", "*.taramanji.com", "evil.example.com", "qa.taramanji.com.evil.example",
		"UPPER_case.taramanji.com", "dev01.taramanji.com", "api.taramanji.com",
	} {
		spec := DistributionSpec{Name: "vrst", OriginType: OriginBucket, Origin: "front", Aliases: []string{bad}}.Normalize()
		if err := spec.ValidateAliases(zt); err == nil {
			t.Errorf("%s は使えない", bad)
		}
	}
	many := DistributionSpec{Name: "vrst", OriginType: OriginBucket, Origin: "front", Aliases: []string{"a1.taramanji.com", "a2.taramanji.com", "a3.taramanji.com", "a4.taramanji.com", "a5.taramanji.com", "a6.taramanji.com"}}
	if err := many.Normalize().ValidateAliases(zt); err == nil {
		t.Error("6 個は多すぎる")
	}
	// 手で書いた YAML で、よそのホスト名を足しても通さない
	evil := strings.Replace(y, "    - qa.taramanji.com", "    - qa.taramanji.com\n    - www.taramanji.com", 1)
	if _, err := ParseDistributionYAML("vrst", evil, zt); evil == y || err == nil {
		t.Error("www を足した YAML は通さない")
	}
}
