package service

// Google カレンダーの予定の色は全アカウント共通の 11 色（colorId "1"〜"11"）。
// 同じ元アカウントの予定は、どのアカウントに書いた同期予定でも同じ色にする（どのカレンダーの予定か見分けるため）。

// ColorOrder は自動で割り当てる順番。隣り合う色が似ないように並べている
var ColorOrder = []string{"9", "6", "10", "3", "5", "11", "7", "4", "2", "1", "8"}

// ValidColor は Google カレンダーの予定の色か
func ValidColor(id string) bool {
	for _, c := range ColorOrder {
		if c == id {
			return true
		}
	}
	return false
}

// NextColor は使われていない色を順番に選ぶ（11 色を使い切ったら、使われている数が一番少ない色）
func NextColor(used []string) string {
	count := map[string]int{}
	for _, u := range used {
		count[u]++
	}
	best := ColorOrder[0]
	for _, c := range ColorOrder {
		if count[c] == 0 {
			return c
		}
		if count[c] < count[best] {
			best = c
		}
	}
	return best
}
