package service

import (
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/jst"
)

const (
	week = 7 * 24 * time.Hour
	// BusyBuffer は埋まっている時間の前後に足す余白
	BusyBuffer = 30 * time.Minute
	// untitled は件名のない予定の表示名（管理画面）
	untitled = "(無題)"
)

// Interval は [Start, End) の時間帯
type Interval struct {
	Start, End time.Time
	Summary    string
}

// IcsParser は iCal（RFC 5545）の予定を、埋まっている時間として取り出す。
// 対応範囲: TRANSP:TRANSPARENT は除く、DURATION、WEEKLY の RRULE（INTERVAL・BYDAY・UNTIL・COUNT）と EXDATE。
// COUNT は旧実装になく、COUNT=1 の古い予定が毎週の予定として扱われていた。
// 時差なしの時刻（TZID 付きや浮動時刻）は Zone の時刻として扱う。
type IcsParser struct {
	Zone *time.Location
}

// NewIcsParser は時差なしの時刻を UTC から offsetMinutes ずれた時刻として読む（既定は日本時間の 540）
func NewIcsParser(offsetMinutes int) IcsParser {
	if offsetMinutes == 9*60 {
		return IcsParser{Zone: jst.Location}
	}
	return IcsParser{Zone: time.FixedZone("ICAL", offsetMinutes*60)}
}

type rawEvent struct {
	dtstart, dtend, duration, rrule, transp, summary string
	exdate                                           []string
	hasSummary                                       bool
}

// unfold は折り返された行（先頭が空白・タブ）を前の行につなげる
func unfold(ics string) []string {
	var lines []string
	for _, raw := range strings.Split(strings.ReplaceAll(ics, "\r\n", "\n"), "\n") {
		if raw == "" {
			continue
		}
		if (raw[0] == ' ' || raw[0] == '\t') && len(lines) > 0 {
			lines[len(lines)-1] += raw[1:]
			continue
		}
		lines = append(lines, raw)
	}
	return lines
}

// value は「名前;パラメータ:値」の値の部分
func value(line string) string {
	if i := strings.IndexByte(line, ':'); i >= 0 {
		return line[i+1:]
	}
	return ""
}

func parseRaw(ics string) []rawEvent {
	var events []rawEvent
	var cur *rawEvent
	for _, raw := range unfold(ics) {
		line := strings.TrimSpace(raw)
		switch {
		case line == "BEGIN:VEVENT":
			cur = &rawEvent{}
		case line == "END:VEVENT":
			if cur != nil && cur.dtstart != "" && !strings.EqualFold(cur.transp, "TRANSPARENT") {
				events = append(events, *cur)
			}
			cur = nil
		case cur == nil:
		case strings.HasPrefix(line, "DTSTART"):
			cur.dtstart = value(line)
		case strings.HasPrefix(line, "DTEND"):
			cur.dtend = value(line)
		case strings.HasPrefix(line, "DURATION"):
			cur.duration = value(line)
		case strings.HasPrefix(line, "RRULE"):
			cur.rrule = value(line)
		case strings.HasPrefix(line, "TRANSP"):
			cur.transp = value(line)
		case strings.HasPrefix(line, "SUMMARY"):
			cur.summary, cur.hasSummary = unescapeText(value(line)), true
		case strings.HasPrefix(line, "EXDATE"):
			if v := value(line); v != "" {
				cur.exdate = append(cur.exdate, strings.Split(v, ",")...)
			}
		}
	}
	return events
}

func unescapeText(s string) string {
	return strings.NewReplacer(`\n`, "\n", `\N`, "\n", `\,`, ",", `\;`, ";", `\\`, `\`).Replace(s)
}

var (
	icsDateTime = regexp.MustCompile(`^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$`)
	icsDate     = regexp.MustCompile(`^(\d{4})(\d{2})(\d{2})$`)
	icsDuration = regexp.MustCompile(`^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$`)
)

func atoi(s string) int {
	n, _ := strconv.Atoi(s)
	return n
}

// instant は ICS の日時・日付を時刻にする（Z は UTC、それ以外は Zone、日付だけなら Zone の 0 時）
func (p IcsParser) instant(v string) (time.Time, bool) {
	if m := icsDateTime.FindStringSubmatch(v); m != nil {
		loc := p.Zone
		if m[7] == "Z" {
			loc = time.UTC
		}
		return time.Date(atoi(m[1]), time.Month(atoi(m[2])), atoi(m[3]), atoi(m[4]), atoi(m[5]), atoi(m[6]), 0, loc), true
	}
	if m := icsDate.FindStringSubmatch(v); m != nil {
		return time.Date(atoi(m[1]), time.Month(atoi(m[2])), atoi(m[3]), 0, 0, 0, 0, p.Zone), true
	}
	return time.Time{}, false
}

func parseDuration(v string) time.Duration {
	m := icsDuration.FindStringSubmatch(v)
	if m == nil {
		return 0
	}
	return time.Duration(atoi(m[1]))*24*time.Hour + time.Duration(atoi(m[2]))*time.Hour +
		time.Duration(atoi(m[3]))*time.Minute + time.Duration(atoi(m[4]))*time.Second
}

type rrule struct {
	freq     string
	interval int
	count    int
	until    string
	byday    map[time.Weekday]bool
}

var weekdayCodes = map[string]time.Weekday{"SU": time.Sunday, "MO": time.Monday, "TU": time.Tuesday,
	"WE": time.Wednesday, "TH": time.Thursday, "FR": time.Friday, "SA": time.Saturday}

func parseRRule(v string) rrule {
	r := rrule{interval: 1}
	for _, part := range strings.Split(v, ";") {
		k, val, ok := strings.Cut(strings.TrimSpace(part), "=")
		if !ok || k == "" || val == "" {
			continue
		}
		switch strings.ToUpper(k) {
		case "FREQ":
			r.freq = strings.ToUpper(val)
		case "INTERVAL":
			if n := atoi(val); n > 0 {
				r.interval = n
			}
		case "COUNT":
			r.count = atoi(val)
		case "UNTIL":
			r.until = val
		case "BYDAY":
			r.byday = map[time.Weekday]bool{}
			for _, d := range strings.Split(strings.ToUpper(val), ",") {
				if wd, ok := weekdayCodes[d]; ok {
					r.byday[wd] = true
				}
			}
		}
	}
	return r
}

// Events は [from, to) に重なる予定を返す（繰り返しは展開する。開始時刻順）
func (p IcsParser) Events(ics string, from, to time.Time) []Interval {
	var out []Interval
	for _, e := range parseRaw(ics) {
		start, ok := p.instant(e.dtstart)
		if !ok {
			continue
		}
		var end time.Time
		switch {
		case e.dtend != "":
			if end, ok = p.instant(e.dtend); !ok {
				continue
			}
		case e.duration != "":
			d := parseDuration(e.duration)
			if d <= 0 {
				d = 30 * time.Minute // 読めない DURATION は旧実装と同じく 30 分とみなす
			}
			end = start.Add(d)
		default:
			continue
		}
		summary := ""
		if e.hasSummary {
			summary = e.summary
		}
		if summary == "" {
			summary = untitled
		}
		for _, iv := range p.occurrences(e, start, end, from, to) {
			iv.Summary = summary
			out = append(out, iv)
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Start.Before(out[j].Start) })
	return out
}

func overlaps(s, e, from, to time.Time) bool { return e.After(from) && s.Before(to) && e.After(s) }

func (p IcsParser) occurrences(e rawEvent, start, end, from, to time.Time) []Interval {
	r := parseRRule(e.rrule)
	if e.rrule == "" || r.freq != "WEEKLY" {
		// 繰り返しなし（WEEKLY 以外の繰り返しも旧実装と同じく 1 回分だけ扱う）
		if overlaps(start, end, from, to) {
			return []Interval{{Start: start, End: end}}
		}
		return nil
	}
	dur := end.Sub(start)
	exdates := map[int64]bool{}
	for _, x := range e.exdate {
		if t, ok := p.instant(x); ok {
			exdates[t.Unix()] = true
		}
	}
	var until time.Time
	if r.until != "" {
		until, _ = p.instant(r.until)
	}
	var out []Interval
	seen := 0 // COUNT は除外日も含めて数える（RFC 5545）
	push := func(s time.Time) {
		if s.Before(start) || (!until.IsZero() && s.After(until)) || (r.count > 0 && seen >= r.count) {
			return
		}
		seen++
		if exdates[s.Unix()] {
			return
		}
		if ee := s.Add(dur); overlaps(s, ee, from, to) {
			out = append(out, Interval{Start: s, End: ee})
		}
	}
	step := week * time.Duration(r.interval)
	iter := start
	// COUNT があるときは最初から数える必要があるので早送りしない
	if n := from.Sub(iter) / step; n > 0 && r.count == 0 {
		iter = iter.Add(n * step)
	}
	// 曜日と時刻はカレンダーの地域時間で数える（旧実装はサーバーの UTC で数えていた）
	base := start.In(p.Zone)
	for guard := to.Add(dur); iter.Before(guard) && (r.count == 0 || seen < r.count); iter = iter.Add(step) {
		if len(r.byday) == 0 {
			push(iter)
			continue
		}
		monday := mondayOf(iter, p.Zone)
		for i := 0; i < 7; i++ {
			d := monday.AddDate(0, 0, i)
			if r.byday[d.Weekday()] {
				push(time.Date(d.Year(), d.Month(), d.Day(), base.Hour(), base.Minute(), base.Second(), 0, p.Zone))
			}
		}
	}
	return out
}

// mondayOf は loc での t を含む週の月曜 0 時
func mondayOf(t time.Time, loc *time.Location) time.Time {
	t = t.In(loc)
	offset := (int(t.Weekday()) + 6) % 7
	return time.Date(t.Year(), t.Month(), t.Day()-offset, 0, 0, 0, 0, loc)
}

// WeekStart は指定がなければ日本時間の今週の月曜 0 時
func WeekStart(iso string, now time.Time) time.Time {
	if t, ok := ParseISO(iso); ok {
		return t
	}
	return mondayOf(now, jst.Location)
}

// ParseISO はブラウザの toISOString() などの ISO 8601 を読む
func ParseISO(iso string) (time.Time, bool) {
	if iso == "" {
		return time.Time{}, false
	}
	for _, layout := range []string{time.RFC3339Nano, "2006-01-02T15:04:05", "2006-01-02T15:04", time.DateOnly} {
		if t, err := time.ParseInLocation(layout, iso, jst.Location); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

// FormatISO は toISOString() と同じ形（UTC・ミリ秒付き）
func FormatISO(t time.Time) string { return t.UTC().Format("2006-01-02T15:04:05.000Z") }

// Busy は予定に前後の余白を足し、週の範囲で切り、重なりをまとめる
func Busy(events []Interval, from, to time.Time, buffer time.Duration) []Interval {
	var clipped []Interval
	for _, e := range events {
		s, en := e.Start.Add(-buffer), e.End.Add(buffer)
		if s.Before(from) {
			s = from
		}
		if en.After(to) {
			en = to
		}
		if en.After(s) {
			clipped = append(clipped, Interval{Start: s, End: en})
		}
	}
	sort.SliceStable(clipped, func(i, j int) bool { return clipped[i].Start.Before(clipped[j].Start) })
	var merged []Interval
	for _, iv := range clipped {
		if n := len(merged); n > 0 && !iv.Start.After(merged[n-1].End) {
			if iv.End.After(merged[n-1].End) {
				merged[n-1].End = iv.End
			}
			continue
		}
		merged = append(merged, iv)
	}
	return merged
}
