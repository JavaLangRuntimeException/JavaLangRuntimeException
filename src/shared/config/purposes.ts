export const PURPOSES = [
  { value: "TechSelect+", label: "TechSelect+の面談" },
  { value: "STECH", label: "学生エンジニアコミュニティSTECHに関するご相談や面談" },
  { value: "JINEN", label: "コミュニティ運営全般や学生エンジニア向けイベントに関するご相談(JINEN)" },
  { value: "NxTEND", label: "NxTEND主催のイベントやコミュニティに関するご相談" },
  { value: "開発委託/相談", label: "プロダクトやシステム開発に関するご依頼やご相談" },
  { value: "RCC", label: "立命館コンピュータクラブに関するご相談(RCC)" },
  { value: "RM2C", label: "研究に関するお問い合わせ(RM2C)" },
  { value: "その他", label: "その他ご相談" },
] as const;

export type Purpose = typeof PURPOSES[number]["value"];


