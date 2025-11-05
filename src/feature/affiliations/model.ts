export type AffiliationCategory =
  | "university_research"
  | "community"
  | "engineer"
  | "community_event_management"
  | "conference_staff"
  | "technical_mentor";

export type Affiliation = { label: string; color: string; href: string; category: AffiliationCategory };

export const affiliations: Affiliation[] = [
  // university_research
  { label: "立命館大学情報理工学部", color: "bg-red-600", href: "https://www.ritsumei.ac.jp/", category: "university_research" },
  { label: "リアリティメディア & モバイルコンピューティング研究室(RM2C)", color: "bg-blue-600", href: "https://www.rm2c.ise.ritsumei.ac.jp/", category: "university_research" },

  // community
  { label: "学術部公認団体 立命館コンピュータクラブ(RCC)", color: "bg-red-600", href: "http://www.rcc.ritsumei.ac.jp/", category: "community" },
  { label: "学生エンジニアコミュニティSTECH Manager", color: "bg-sky-600", href: "https://stech.jinnen.co.jp/", category: "community" },
  { label: "CATechLounge", color: "bg-cyan-600", href: "https://www.cyberagent.co.jp/careers/special/students/tech_lounge/", category: "community" },

  // engineer
  { label: "株式会社サイバーエージェント 2028 Engineer", color: "bg-lime-600", href: "https://www.cyberagent.co.jp/", category: "engineer" },
  { label: "任天堂株式会社長期アルバイト", color: "bg-red-600", href: "https://www.nintendo.com/jp", category: "engineer" },

  // community_event_management
  { label: "特定非営利活動法人NxTEND 新規事業推進室", color: "bg-amber-600", href: "https://www.nxtend.or.jp/", category: "community_event_management" },
  { label: "JINEN株式会社", color: "bg-blue-900", href: "https://jinnen.co.jp/", category: "community_event_management" },
  { label: "kyoto.go Organizer", color: "bg-violet-600", href: "https://x.com/kyotogolang", category: "community_event_management" },
  { label: "biwako.go Organizer", color: "bg-amber-800", href: "https://x.com/biwakogolang", category: "community_event_management" },

  // conference_staff
  { label: "GoConference Staff", color: "bg-sky-600", href: "https://gocon.jp/", category: "conference_staff" },
  { label: "GoWorkshopConference Staff", color: "bg-fuchsia-600", href: "https://gwc.gocon.jp/", category: "conference_staff" },

  { label: "TSKaigi Staff", color: "bg-cyan-600", href: "https://tskaigi.org/", category: "conference_staff" },

  // technical_mentor
  { label: "株式会社ローカルイノベーション(TechSelect+ 技術メンター)", color: "bg-lime-600", href: "https://local-innovation.com/", category: "technical_mentor" },
];


