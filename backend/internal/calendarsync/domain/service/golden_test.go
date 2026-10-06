package service

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/javalangruntimeexception/taramanji/backend/internal/calendarsync/domain/gateway"
)

// testdata/golden.json は旧実装（reconcile.ts）を Node で実行して作った。
// 予定 ID・記録のキー・本文のダイジェストが 1 文字でも違うと、切り替え時に全同期予定を作り直してしまう
func TestGoldenMatchesLegacy(t *testing.T) {
	raw, err := os.ReadFile("testdata/golden.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Source, Target, Digest, ID, Key, EndAt string
		Event                                  gateway.Event
		Detailed, Private                      bool
		Body                                   map[string]any
	}
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatal(err)
	}
	for i, c := range cases {
		body := BuildMirrorBody(c.Source, c.Event, c.Detailed, c.Private, "")
		if got := Digest(body); got != c.Digest {
			gotJSON, _ := json.Marshal(BodyMap(body))
			wantJSON, _ := json.Marshal(c.Body)
			t.Errorf("case %d digest mismatch\n go:  %s\n ts:  %s", i, gotJSON, wantJSON)
		}
		if got := MirrorID(c.Source, c.Event.ID, c.Target); got != c.ID {
			t.Errorf("case %d id %s != %s", i, got, c.ID)
		}
		if got := MirrorKey(c.Source, c.Event.ID, c.Target); got != c.Key {
			t.Errorf("case %d key %s != %s", i, got, c.Key)
		}
		if got := FormatISO(EventEnd(c.Event)); got != c.EndAt {
			t.Errorf("case %d endAt %s != %s", i, got, c.EndAt)
		}
	}
}
