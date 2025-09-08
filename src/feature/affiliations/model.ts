export type AffiliationCategory =
  | "大学・研究室"
  | "コミュニティ"
  | "エンジニア"
  | "コミュニティ運営"
  | "イベント運営"
  | "技術メンター";

export type Affiliation = { label: string; color: string; href: string; category: AffiliationCategory };

export const affiliations: Affiliation[] = [
  // 大学・研究室
  { label: "立命館大学情報理工学部", color: "bg-red-600", href: "https://www.ritsumei.ac.jp/", category: "大学・研究室" },
  { label: "リアリティメディア & モバイルコンピューティング研究室(RM2C)", color: "bg-blue-600", href: "https://www.rm2c.ise.ritsumei.ac.jp/", category: "大学・研究室" },

  // コミュニティ
  { label: "学術部公認団体 立命館コンピュータクラブ(RCC)", color: "bg-red-600", href: "http://www.rcc.ritsumei.ac.jp/", category: "コミュニティ" },
  { label: "学生エンジニアコミュニティSTECH Manager", color: "bg-sky-600", href: "https://stech.jinnen.co.jp/", category: "コミュニティ" },
  { label: "CATechLounge", color: "bg-cyan-600", href: "https://www.cyberagent.co.jp/careers/special/students/tech_lounge/", category: "コミュニティ" },

  // エンジニア
  { label: "株式会社サイバーエージェント 2028 Engineer", color: "bg-lime-600", href: "https://www.cyberagent.co.jp/", category: "エンジニア" },
  { label: "任天堂株式会社長期アルバイト", color: "bg-red-600", href: "https://www.nintendo.com/jp", category: "エンジニア" },

  // コミュニティ運営
  { label: "特定非営利活動法人NxTEND 新規事業推進室", color: "bg-amber-600", href: "https://www.nxtend.or.jp/", category: "コミュニティ運営" },
  { label: "JINEN株式会社", color: "bg-blue-900", href: "https://jinnen.co.jp/", category: "コミュニティ運営" },

  // イベント運営
  { label: "GoConference Staff", color: "bg-sky-600", href: "https://gocon.jp/", category: "イベント運営" },
  { label: "GoWorkshopConference Staff", color: "bg-fuchsia-600", href: "https://gwc.gocon.jp/", category: "イベント運営" },
  { label: "kyoto.go Organizer", color: "bg-violet-600", href: "https://x.com/kyotogolang", category: "イベント運営" },

  // 技術メンター
  { label: "株式会社ローカルイノベーション(TechSelect+ 技術メンター)", color: "bg-lime-600", href: "https://local-innovation.com/", category: "技術メンター" },
];


