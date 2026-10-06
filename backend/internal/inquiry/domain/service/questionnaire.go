package service

import (
	"fmt"
	"strconv"
	"strings"
)

type Questionnaire struct {
	Name         string
	VRUsage      string
	Height       float64
	TrialPattern string
	Responses    map[string]int32 // r1〜r18
}

// Validate は旧フロントの zod スキーマ（src/shared/validation/questionnaire.ts）と同じ条件をサーバーでも確かめる。
// 戻り値は不正だった項目名。
func (q Questionnaire) Validate() []string {
	var bad []string
	if strings.TrimSpace(q.Name) == "" {
		bad = append(bad, "name")
	}
	if _, ok := VRUsageLabels[q.VRUsage]; !ok {
		bad = append(bad, "vrUsage")
	}
	if q.Height < 100 || q.Height > 250 {
		bad = append(bad, "height")
	}
	if _, ok := TrialPatternLabels[q.TrialPattern]; !ok {
		bad = append(bad, "trialPattern")
	}
	for i := 1; i <= 18; i++ {
		key := fmt.Sprintf("r%d", i)
		v, ok := q.Responses[key]
		max := int32(7)
		if i >= 7 && i <= 12 {
			max = 20 // NASA-TLX
		}
		if !ok || v < 1 || v > max {
			bad = append(bad, key)
		}
	}
	return bad
}

func label(m map[string]string, v string) string {
	if l, ok := m[v]; ok {
		return l
	}
	return v
}

// QuestionnaireMail は旧実装と同じ本文
func QuestionnaireMail(q Questionnaire) string {
	pairs := []string{
		"{{name}}", q.Name,
		"{{vrUsage}}", label(VRUsageLabels, q.VRUsage),
		"{{height}}", strconv.FormatFloat(q.Height, 'f', -1, 64), // JavaScript の数値の文字列化と同じ（170 → 170、170.5 → 170.5）
		"{{trialPattern}}", label(TrialPatternLabels, q.TrialPattern),
	}
	// r10〜r18 を先に置換する（{{r1}} が {{r10}} の一部に当たらないよう、キーは閉じ括弧まで含めている）
	for i := 18; i >= 1; i-- {
		pairs = append(pairs, fmt.Sprintf("{{r%d}}", i), strconv.Itoa(int(q.Responses[fmt.Sprintf("r%d", i)])))
	}
	return strings.NewReplacer(pairs...).Replace(questionnaireTemplate)
}
