package service

import (
	"reflect"
	"strings"
	"testing"
)

func TestAPIKeyAndCORS(t *testing.T) {
	key, meta, err := NewAPIKey("ci")
	if err != nil || !strings.HasPrefix(key, "tck_") || len(key) != 44 || meta.Prefix != key[:12] || meta.Hash != HashAPIKey(key) || strings.Contains(meta.Hash, key) {
		t.Fatalf("key %q meta %+v %v", key, meta, err)
	}
	other, meta2, _ := NewAPIKey("web")
	if other == key {
		t.Fatal("同じキーができた")
	}

	s := APISpec{Name: "shop", Routes: []APIRoute{{Path: "/", Function: "web"}, {Path: "/api", Function: "api"}}, Auth: AuthAPIKey,
		Keys: []APIKey{meta2, meta}, CORSOrigins: []string{"https://Front-storage-cloud.taramanji.com/", "http://localhost:5173"}}.Normalize()
	if err := s.Validate(); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(s.CORSOrigins, []string{"http://localhost:5173", "https://front-storage-cloud.taramanji.com"}) || s.Keys[0].Name != "ci" {
		t.Fatalf("normalize: %+v", s)
	}
	y, err := RenderAPIYAML(s, target)
	if err != nil {
		t.Fatal(err)
	}
	// キーそのものは YAML に残らない（ハッシュだけ）
	if strings.Contains(y, key) || strings.Contains(y, other) {
		t.Fatal("API キーが YAML に入っている")
	}
	for _, want := range []string{"name: X-Cloud-Auth", "value: api_key", "name: X-Cloud-Api-Keys", "ci=" + meta.Hash, "name: X-Cloud-Cors", "http://localhost:5173 https://front-storage-cloud.taramanji.com", AnnotationAPIKeys} {
		if !strings.Contains(y, want) {
			t.Errorf("YAML に %q がない:\n%s", want, y)
		}
	}
	p, err := ParseAPIYAML("shop", y, target)
	if err != nil || !p.FormEditable || !reflect.DeepEqual(p.Spec, s) {
		t.Fatalf("読み戻し: %+v %v", p, err)
	}

	// API Gateway が確かめるとき: 当たったキーの名前を返す。違うキー・空・頭だけは通さない
	header := "ci=" + meta.Hash + ",web=" + meta2.Hash
	if name, ok := MatchAPIKey(header, key); !ok || name != "ci" {
		t.Fatalf("match: %q %v", name, ok)
	}
	if name, ok := MatchAPIKey(header, other); !ok || name != "web" {
		t.Fatalf("match web: %q %v", name, ok)
	}
	for _, bad := range []string{"", meta.Prefix, key + "x", meta.Hash, "tck_0000000000000000000000000000000000000000"} {
		if _, ok := MatchAPIKey(header, bad); ok {
			t.Errorf("%q を通してしまう", bad)
		}
	}
	if _, ok := MatchAPIKey("-", key); ok {
		t.Error("キーがないときは、どれも通さない")
	}

	// 手で書いた YAML: ヘッダーと注釈のキーがそろわない・ルートごとに違う・知らない認証は通さない
	for name, src := range map[string]string{
		"注釈にないキー":   strings.Replace(y, "ci="+meta.Hash, "ci="+strings.Repeat("0", 64), 2),
		"ルートごとに違う":  strings.Replace(y, "value: api_key", "value: none", 1),
		"知らない認証":    strings.ReplaceAll(y, "value: api_key", "value: basic"),
		"よそのオリジンの形": strings.ReplaceAll(y, "http://localhost:5173 https://", "http://localhost:5173/path https://"),
	} {
		if _, err := ParseAPIYAML("shop", src, target); src == y || err == nil {
			t.Errorf("%s は通さない", name)
		}
	}

	// 認証なし・CORS なし: ヘッダーは消すだけ（利用者が付けてきても効かない）
	plain, _ := RenderAPIYAML(APISpec{Name: "shop", Routes: []APIRoute{{Path: "/", Function: "web"}}}.Normalize(), target)
	if strings.Contains(plain, "name: X-Cloud-Auth") || !strings.Contains(plain, "- X-Cloud-Auth") || !strings.Contains(plain, "- X-Cloud-Cors") {
		t.Fatalf("plain:\n%s", plain)
	}
	// キーがまだないときは "-"（どれも当たらない）
	nokey, _ := RenderAPIYAML(APISpec{Name: "shop", Routes: []APIRoute{{Path: "/", Function: "web"}}, Auth: AuthAPIKey}.Normalize(), target)
	if !strings.Contains(nokey, "value: '-'") && !strings.Contains(nokey, `value: "-"`) {
		t.Fatalf("nokey:\n%s", nokey)
	}
	if p, err := ParseAPIYAML("shop", nokey, target); err != nil || p.Spec.Auth != AuthAPIKey || len(p.Spec.Keys) != 0 {
		t.Fatalf("nokey 読み戻し: %+v %v", p, err)
	}

	for name, bad := range map[string]APISpec{
		"知らない認証":    {Auth: "basic"},
		"キーが多すぎる":   {Auth: AuthAPIKey, Keys: []APIKey{meta, meta2, meta, meta2, meta, meta2}},
		"キーの名前の重複":  {Auth: AuthAPIKey, Keys: []APIKey{meta, meta}},
		"ハッシュが違う形":  {Auth: AuthAPIKey, Keys: []APIKey{{Name: "x", Prefix: meta.Prefix, Hash: "abc"}}},
		"パス付きのオリジン": {CORSOrigins: []string{"https://a.example.com/path"}},
		"スキームなし":    {CORSOrigins: []string{"a.example.com"}},
	} {
		bad.Name, bad.Routes = "shop", []APIRoute{{Path: "/", Function: "web"}}
		if err := bad.Normalize().Validate(); err == nil {
			t.Errorf("%s は通さない", name)
		}
	}
	if err := (APISpec{Name: "shop", Routes: []APIRoute{{Path: "/", Function: "web"}}, CORSOrigins: []string{"*"}}).Normalize().Validate(); err != nil {
		t.Fatalf("* は通す: %v", err)
	}
}
