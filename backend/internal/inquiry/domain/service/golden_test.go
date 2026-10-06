package service

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

// testdata/golden.json は旧実装（src/app/api/contact|questionnaire/route.ts）の関数を Node で実行して作った期待値。
// メールの件名・本文が旧実装と一字一句同じであることを保証する。
type golden struct {
	Contact []struct {
		Input struct {
			Email, Name, Organization, Subject, Purpose, Message, EventID string
			Files                                                         []string
		} `json:"input"`
		AdminSubject string `json:"adminSubject"`
		AdminMessage string `json:"adminMessage"`
		UserMessage  string `json:"userMessage"`
	} `json:"contact"`
	Questionnaire struct {
		Input map[string]any `json:"input"`
		Body  string         `json:"body"`
	} `json:"questionnaire"`
}

func loadGolden(t *testing.T) golden {
	t.Helper()
	raw, err := os.ReadFile("testdata/golden.json")
	if err != nil {
		t.Fatal(err)
	}
	var g golden
	if err := json.Unmarshal(raw, &g); err != nil {
		t.Fatal(err)
	}
	return g
}

func TestContactMailMatchesLegacy(t *testing.T) {
	g := loadGolden(t)
	for _, c := range g.Contact {
		in := c.Input
		form := ContactForm{Email: in.Email, Name: in.Name, Organization: in.Organization, Subject: in.Subject,
			Purpose: in.Purpose, Message: in.Message, EventID: in.EventID}
		name := in.Purpose + "/" + in.Name
		if got := AdminSubject(in.Purpose, in.Name); got != c.AdminSubject {
			t.Errorf("%s admin subject:\n got %q\nwant %q", name, got, c.AdminSubject)
		}
		if got := AdminMessage(form, in.Files); got != c.AdminMessage {
			t.Errorf("%s admin message:\n got %q\nwant %q", name, got, c.AdminMessage)
		}
		if got := UserMessage(form, in.Files); got != c.UserMessage {
			t.Errorf("%s user message:\n got %q\nwant %q", name, got, c.UserMessage)
		}
	}
}

func TestQuestionnaireMailMatchesLegacy(t *testing.T) {
	g := loadGolden(t)
	in := g.Questionnaire.Input
	q := Questionnaire{Name: in["name"].(string), VRUsage: in["vrUsage"].(string), Height: in["height"].(float64),
		TrialPattern: in["trialPattern"].(string), Responses: map[string]int32{}}
	for k, v := range in {
		if strings.HasPrefix(k, "r") && len(k) <= 3 {
			q.Responses[k] = int32(v.(float64))
		}
	}
	if got := QuestionnaireMail(q); got != g.Questionnaire.Body {
		t.Fatalf("questionnaire body differs:\n got %q\nwant %q", got, g.Questionnaire.Body)
	}
	if bad := q.Validate(); len(bad) != 0 {
		t.Fatalf("valid answers rejected: %v", bad)
	}
	q.Responses["r8"] = 21
	q.Height = 99
	if bad := q.Validate(); len(bad) != 2 {
		t.Fatalf("want height and r8 invalid, got %v", bad)
	}
}

func TestFileInfoRoundsLikeJS(t *testing.T) {
	got := FileInfo([]ContactFile{{Name: "a.pdf", Size: 1536}, {Name: "b.png", Size: 511}})
	if got[0] != "a.pdf (2KB)" || got[1] != "b.png (0KB)" {
		t.Fatalf("got %v", got)
	}
}
