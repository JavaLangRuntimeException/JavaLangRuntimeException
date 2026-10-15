import type { L10n } from "@/shared/lib/i18n";

// 相談内容の選択肢。value は API に送る値（言語で変えない）、label は画面に出す文言
export const PURPOSES = [
  { value: "TechSelect+", label: { ja: "TechSelect+の面談", en: "Interview for TechSelect+" } },
  { value: "STECH", label: { ja: "学生エンジニアコミュニティSTECHに関するご相談や面談", en: "Consultation or interview about STECH, a student engineer community" } },
  { value: "JINEN", label: { ja: "コミュニティ運営全般や学生エンジニア向けイベントに関するご相談(JINEN)", en: "Consultation on community management or events for student engineers (JINEN)" } },
  { value: "NxTEND_Event", label: { ja: "NxTEND主催のイベントやコミュニティに関するご相談", en: "Consultation on events or communities organized by NxTEND" } },
  { value: "NxTEND_Organize", label: { ja: "NxTEND運営参加に関するご相談", en: "Consultation on joining the NxTEND organizing team" } },
  { value: "biwako.go", label: { ja: "biwako.goのイベントに関するご相談", en: "Consultation on biwako.go events" } },
  { value: "kyoto.go", label: { ja: "kyoto.goのイベントに関するご相談", en: "Consultation on kyoto.go events" } },
  { value: "開発委託/相談", label: { ja: "プロダクトやシステム開発に関するご依頼やご相談", en: "Requests or consultation on product or system development" } },
  { value: "出張撮影依頼", label: { ja: "出張撮影依頼", en: "On-location photography request" } },
  { value: "RCC", label: { ja: "立命館コンピュータクラブに関するご相談(RCC)", en: "Consultation on the Ritsumeikan Computer Club (RCC)" } },
  { value: "RM2C", label: { ja: "研究に関するお問い合わせ(RM2C)", en: "Inquiry about research (RM2C)" } },
  { value: "その他", label: { ja: "その他ご相談", en: "Other consultation" } },
] as const satisfies readonly { value: string; label: L10n }[];

// Contactページ用のlabel
export const CONTACT_PURPOSES = [
  { value: "taramanji", label: { ja: "本ページに関するお問い合わせ", en: "Inquiry about this website" } },
  { value: "Ask Me", label: { ja: "面談予約の変更・取消について", en: "Changing or canceling a meeting reservation" } },
  { value: "TechSelect+", label: { ja: "TechSelect+について", en: "About TechSelect+" } },
  { value: "STECH", label: { ja: "学生エンジニアコミュニティSTECHについてのお問い合わせ", en: "Inquiry about STECH, a student engineer community" } },
  { value: "JINEN", label: { ja: "コミュニティ運営全般や学生エンジニア向けイベントについてのお問い合わせ(JINEN)", en: "Inquiry about community management or events for student engineers (JINEN)" } },
  { value: "NxTEND_Event", label: { ja: "NxTEND主催のイベントやコミュニティについてのお問い合わせ", en: "Inquiry about events or communities organized by NxTEND" } },
  { value: "NxTEND_Organize", label: { ja: "NxTEND運営参加についてのお問い合わせ", en: "Inquiry about joining the NxTEND organizing team" } },
  { value: "biwako.go", label: { ja: "biwako.goのイベントについてのお問い合わせ", en: "Inquiry about biwako.go events" } },
  { value: "kyoto.go", label: { ja: "kyoto.goのイベントについてのお問い合わせ", en: "Inquiry about kyoto.go events" } },
  { value: "開発委託/相談", label: { ja: "プロダクトやシステム開発に関するご依頼やご相談", en: "Requests or consultation on product or system development" } },
  { value: "出張撮影/写真相談", label: { ja: "出張撮影などカメラ・写真全般に関するご相談", en: "Consultation on on-location photography or cameras and photos in general" } },
  { value: "RCC", label: { ja: "立命館コンピュータクラブに関するお問い合わせ(RCC)", en: "Inquiry about the Ritsumeikan Computer Club (RCC)" } },
  { value: "RM2C", label: { ja: "研究に関するお問い合わせ(RM2C)", en: "Inquiry about research (RM2C)" } },
  { value: "その他", label: { ja: "その他お問い合わせ", en: "Other inquiries" } },
] as const satisfies readonly { value: string; label: L10n }[];

export type Purpose = typeof PURPOSES[number]["value"];
