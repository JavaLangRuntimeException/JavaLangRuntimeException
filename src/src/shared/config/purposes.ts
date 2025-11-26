export const PURPOSES = [
  { value: "TechSelect+", label: "TechSelect+の面談" },
  { value: "STECH", label: "学生エンジニアコミュニティSTECHに関するご相談や面談" },
  { value: "JINEN", label: "コミュニティ運営全般や学生エンジニア向けイベントに関するご相談(JINEN)" },
  { value: "NxTEND_Event", label: "NxTEND主催のイベントやコミュニティに関するご相談" },
  { value: "NxTEND_Organize", label: "NxTEND運営参加に関するご相談" },
  { value: "biwako.go", label: "biwako.goのイベントに関するご相談" },
  { value: "kyoto.go", label: "kyoto.goのイベントに関するご相談" },
  { value: "開発委託/相談", label: "プロダクトやシステム開発に関するご依頼やご相談" },
  { value: "RCC", label: "立命館コンピュータクラブに関するご相談(RCC)" },
  { value: "RM2C", label: "研究に関するお問い合わせ(RM2C)" },
  { value: "その他", label: "その他ご相談" },
] as const;

// Contactページ用のlabel
export const CONTACT_PURPOSES = [
  { value: "taramanji", label: "本ページに関するお問い合わせ" },
  { value: "Ask Me", label: "面談予約の変更・取消について" },
  { value: "TechSelect+", label: "TechSelect+について" },
  { value: "STECH", label: "学生エンジニアコミュニティSTECHについてのお問い合わせ" },
  { value: "JINEN", label: "コミュニティ運営全般や学生エンジニア向けイベントについてのお問い合わせ(JINEN)" },
  { value: "NxTEND_Event", label: "NxTEND主催のイベントやコミュニティについてのお問い合わせ" },
  { value: "NxTEND_Organize", label: "NxTEND運営参加についてのお問い合わせ" },
  { value: "biwako.go", label: "biwako.goのイベントについてのお問い合わせ" },
  { value: "kyoto.go", label: "kyoto.goのイベントについてのお問い合わせ" },
  { value: "開発委託/相談", label: "プロダクトやシステム開発に関するご依頼やご相談" },
  { value: "RCC", label: "立命館コンピュータクラブに関するお問い合わせ(RCC)" },
  { value: "RM2C", label: "研究に関するお問い合わせ(RM2C)" },
  { value: "その他", label: "その他お問い合わせ" },
] as const;

export type Purpose = typeof PURPOSES[number]["value"];


