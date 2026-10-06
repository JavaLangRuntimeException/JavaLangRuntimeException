package service

import (
	"fmt"
	"math"
	"strings"
)

// ContactPurposeLabels は Contact ページの「お問い合わせ要件」（旧 src/shared/config/purposes.ts の CONTACT_PURPOSES）
var ContactPurposeLabels = map[string]string{
	"taramanji":       "本ページに関するお問い合わせ",
	"Ask Me":          "面談予約の変更・取消について",
	"TechSelect+":     "TechSelect+について",
	"STECH":           "学生エンジニアコミュニティSTECHについてのお問い合わせ",
	"JINEN":           "コミュニティ運営全般や学生エンジニア向けイベントについてのお問い合わせ(JINEN)",
	"NxTEND_Event":    "NxTEND主催のイベントやコミュニティについてのお問い合わせ",
	"NxTEND_Organize": "NxTEND運営参加についてのお問い合わせ",
	"biwako.go":       "biwako.goのイベントについてのお問い合わせ",
	"kyoto.go":        "kyoto.goのイベントについてのお問い合わせ",
	"開発委託/相談":         "プロダクトやシステム開発に関するご依頼やご相談",
	"出張撮影/写真相談":       "出張撮影などカメラ・写真全般に関するご相談",
	"RCC":             "立命館コンピュータクラブに関するお問い合わせ(RCC)",
	"RM2C":            "研究に関するお問い合わせ(RM2C)",
	"その他":             "その他お問い合わせ",
}

// adminSubjectPrefix は管理者向け件名の接頭辞（旧 getAdminSubject）。未知の要件は「ご相談」
var adminSubjectPrefix = map[string]string{
	"taramanji":       "本ページに関するお問い合わせ",
	"Ask Me":          "面談予約の変更・取消について",
	"TechSelect+":     "TS+ご相談",
	"開発委託/相談":         "開発ご相談",
	"STECH":           "STECHご相談",
	"RM2C":            "RM2Cご相談",
	"JINEN":           "コミュニティご相談",
	"NxTEND_Event":    "NxTEND_Eventご相談",
	"NxTEND_Organize": "NxTEND_Organizeご相談",
	"biwako.go":       "biwako.goご相談",
	"kyoto.go":        "kyoto.goご相談",
	"RCC":             "RCCご相談",
	"その他":             "ご相談",
}

type ContactForm struct {
	Email        string
	Name         string
	Organization string
	Subject      string
	Purpose      string
	Message      string
	EventID      string
}

type ContactFile struct {
	Name        string
	ContentType string
	Size        int
}

func purposeLabel(p string) string {
	if l, ok := ContactPurposeLabels[p]; ok {
		return l
	}
	return p
}

// FileInfo は「名前 (nKB)」（旧実装の Math.round(size / 1024)）
func FileInfo(files []ContactFile) []string {
	out := make([]string, 0, len(files))
	for _, f := range files {
		out = append(out, fmt.Sprintf("%s (%dKB)", f.Name, int(math.Round(float64(f.Size)/1024))))
	}
	return out
}

func AdminSubject(purpose, name string) string {
	if name == "" {
		name = "ゲスト"
	}
	prefix, ok := adminSubjectPrefix[purpose]
	if !ok {
		prefix = "ご相談"
	}
	return fmt.Sprintf("%s_%s様x棚橋(taramanji)", prefix, name)
}

func AdminMessage(f ContactForm, fileInfo []string) string {
	lines := []string{
		"お問い合わせ内容: " + purposeLabel(f.Purpose),
		"件名: " + f.Subject,
		"",
		"=== お問い合わせ内容 ===",
		f.Message,
		"",
		"=== お客様情報 ===",
		"お名前: " + f.Name,
		"メールアドレス: " + f.Email,
	}
	if f.Organization != "" {
		lines = append(lines, "ご所属: "+f.Organization)
	}
	if f.EventID != "" {
		lines = append(lines, "EventID: "+f.EventID)
	}
	if len(fileInfo) > 0 {
		lines = append(lines, "", "=== 添付ファイル ===")
		for _, fi := range fileInfo {
			lines = append(lines, "• "+fi)
		}
	}
	return strings.Join(lines, "\n")
}

func UserSubject(subject string) string { return "【お問い合わせ確認】" + subject }

func UserMessage(f ContactForm, fileInfo []string) string {
	var b strings.Builder
	b.WriteString("お問い合わせありがとうございます。\n\ntaramanji.comの自動応答システムです。\n\n以下の内容でお問い合わせを受け付けました。\n\n")
	b.WriteString("=== お問い合わせ内容 ===\n")
	b.WriteString("件名: " + f.Subject + "\n")
	b.WriteString("お問い合わせ要件: " + purposeLabel(f.Purpose) + "\n")
	b.WriteString("お問い合わせ内容:\n" + f.Message + "\n\n")
	b.WriteString("=== お客様情報 ===\n")
	b.WriteString("お名前: " + f.Name + "\n")
	b.WriteString("メールアドレス: " + f.Email)
	if f.Organization != "" {
		b.WriteString("\nご所属: " + f.Organization)
	}
	if f.EventID != "" {
		b.WriteString("\nEventID: " + f.EventID)
	}
	if len(fileInfo) > 0 {
		b.WriteString("\n\n=== 添付ファイル ===\n")
		for _, fi := range fileInfo {
			b.WriteString("• " + fi + "\n")
		}
	}
	b.WriteString("\n※このメールは送信専用です。1週間以内にこちらから再度連絡いたします。\n\n今後ともよろしくお願いいたします。")
	return b.String()
}
