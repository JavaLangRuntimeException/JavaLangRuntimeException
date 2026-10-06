package service

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"
)

// 同期予定の ID・記録のキー・本文のダイジェストは、旧実装（TypeScript）と元の calendar-busy-sync（Python）が
// JSON.stringify / json.dumps で作った文字列のハッシュ。1 文字でも違うと既存の同期予定を作り直してしまうので、
// encoding/json（<>& や U+2028 をエスケープする）ではなく JavaScript と同じ規則で文字列化する。

// jsQuote は JSON.stringify(string) と同じ結果を返す
func jsQuote(s string) string {
	var b strings.Builder
	b.Grow(len(s) + 2)
	b.WriteByte('"')
	for i := 0; i < len(s); {
		r, size := utf8.DecodeRuneInString(s[i:])
		i += size
		switch r {
		case '"':
			b.WriteString(`\"`)
		case '\\':
			b.WriteString(`\\`)
		case '\b':
			b.WriteString(`\b`)
		case '\f':
			b.WriteString(`\f`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		default:
			if r < 0x20 {
				fmt.Fprintf(&b, `\u%04x`, r)
			} else {
				b.WriteRune(r)
			}
		}
	}
	b.WriteByte('"')
	return b.String()
}

// stableStringify はキーを並べ替えた JSON（旧実装の stableStringify と同じ）
func stableStringify(v any) string {
	switch t := v.(type) {
	case nil:
		return "null"
	case string:
		return jsQuote(t)
	case bool:
		return strconv.FormatBool(t)
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64)
	case int:
		return strconv.Itoa(t)
	case []any:
		parts := make([]string, len(t))
		for i, e := range t {
			parts[i] = stableStringify(e)
		}
		return "[" + strings.Join(parts, ",") + "]"
	case map[string]any:
		keys := make([]string, 0, len(t))
		for k := range t {
			keys = append(keys, k)
		}
		sort.Strings(keys) // キーは ASCII なので UTF-16 順と同じ
		parts := make([]string, len(keys))
		for i, k := range keys {
			parts[i] = jsQuote(k) + ":" + stableStringify(t[k])
		}
		return "{" + strings.Join(parts, ",") + "}"
	default:
		panic(fmt.Sprintf("stableStringify: unsupported %T", v))
	}
}

func sha256Hex(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}

// MirrorKey は同期の記録のキー（JSON の [元カレンダー, 元予定 ID, 同期先]）
func MirrorKey(sourceID, eventID, targetID string) string {
	return "[" + jsQuote(sourceID) + "," + jsQuote(eventID) + "," + jsQuote(targetID) + "]"
}

// MirrorID は同期予定の ID。Google Calendar の ID に使える文字（base32hex）に収まるよう b + SHA-256 の 16 進
func MirrorID(sourceID, eventID, targetID string) string {
	return "b" + sha256Hex(MirrorKey(sourceID, eventID, targetID))
}
