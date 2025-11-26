export type AffiliationCategory =
    | "university_research"
    | "community"
    | "engineer"
    | "community_director"
    | "event_management"
    | "community_organizer"
    | "conference_staff"
    | "technical_mentor";

export type Affiliation = {
    label: string;
    color: string;
    href: string;
    category: AffiliationCategory;
    description?: string;
};

export const affiliations: Affiliation[] = [
    // university_research
    {
        label: "立命館大学情報理工学部",
        color: "bg-red-600",
        href: "https://www.ritsumei.ac.jp/",
        category: "university_research",
        description: "立命館大学情報理工学部にて、コンピュータサイエンスとエンジニアリングを学んでいます。"
    },
    {
        label: "リアリティメディア & モバイルコンピューティング研究室(RM2C)",
        color: "bg-blue-600",
        href: "https://www.rm2c.ise.ritsumei.ac.jp/",
        category: "university_research",
        description: "VR/AR/MRなどのXRシステムに関する位置推定技術やクライアント間の通信に関する研究や、XR環境を使用したヒューマンインターフェースなど心理学実験を行っています。"
    },

    // community
    {
        label: "学術部公認団体 立命館コンピュータクラブ(RCC)",
        color: "bg-red-600",
        href: "http://www.rcc.ritsumei.ac.jp/",
        category: "community",
        description: "立命館大学学術部公認団体として、コンピュータ技術の研究・学習活動を行っています。"
    },
    {
        label: "学生エンジニアコミュニティSTECH Manager",
        color: "bg-sky-600",
        href: "https://stech.jinnen.co.jp/",
        category: "community",
        description: "上位1%の学生エンジニアが集う審査制コミュニティSTECHのマネージャーとして運営に携わっています。"
    },
    {
        label: "CATechLounge",
        color: "bg-cyan-600",
        href: "https://www.cyberagent.co.jp/careers/special/students/tech_lounge/",
        category: "community",
        description: "サイバーエージェントが運営する学生向け技術コミュニティに参加しています。"
    },

    // engineer
    {
        label: "株式会社サイバーエージェント 2028 Engineer",
        color: "bg-lime-600",
        href: "https://www.cyberagent.co.jp/",
        category: "engineer",
        description: "サイバーエージェント2028年卒のサーバーサイドエンジニアとして、技術開発に取り組んでいます。"
    },
    {
        label: "任天堂株式会社 長期アルバイト",
        color: "bg-red-600",
        href: "https://www.nintendo.com/jp",
        category: "engineer",
        description: "任天堂にてソフトウェアエンジニアとして長期アルバイトに従事しています。"
    },

    // community_director
    {
        label: "JINEN株式会社 Community Director / Engineer",
        color: "bg-blue-900",
        href: "https://jinnen.co.jp/",
        category: "community_director",
        description: "学生エンジニアコミュニティSTECHの運営サポートや各種コミュニティに必要なツールの開発を行っています。"
    },

    // event_management
    {
        label: "特定非営利活動法人NxTEND 新規事業推進室",
        color: "bg-amber-600",
        href: "https://www.nxtend.or.jp/",
        category: "event_management",
        description: "NxTENDにて各地域のエンジニアコミュニティを活性化するための新規事業の企画・運営を行っています。"
    },

    // community_organizer
    {
        label: "kyoto.go Organizer",
        color: "bg-violet-600",
        href: "https://x.com/kyotogolang",
        category: "community_organizer",
        description: "京都のGo当地コミュニティを主催し、定期的な勉強会やイベントを開催しています。"
    },
    {
        label: "biwako.go Organizer",
        color: "bg-amber-800",
        href: "https://x.com/biwakogolang",
        category: "community_organizer",
        description: "滋賀のGo当地コミュニティを主催し、定期的な勉強会やイベントを開催しています。"
    },

    // conference_staff
    {
        label: "GoConference Staff",
        color: "bg-sky-600",
        href: "https://gocon.jp/",
        category: "conference_staff",
        description: "Go言語に関するカンファレンスであるGoConferenceの運営スタッフとして参加しています。"
    },
    {
        label: "GoWorkshopConference Staff",
        color: "bg-fuchsia-600",
        href: "https://gwc.gocon.jp/",
        category: "conference_staff",
        description: "Go言語に関するワークショップイベントであるGoWorkshopConferenceの企画・運営に携わっています。"
    },
    {
        label: "TSKaigi Staff",
        color: "bg-cyan-600",
        href: "https://tskaigi.org/",
        category: "conference_staff",
        description: "TypeScriptカンファレンスであるTSKaigiの運営スタッフとして活動しています。"
    },

    // technical_mentor
    {
        label: "株式会社ローカルイノベーション(TechSelect+ 技術メンター)",
        color: "bg-lime-600",
        href: "https://local-innovation.com/",
        category: "technical_mentor",
        description: "学生エンジニアの技術的な成長をサポートするTechSelect+の技術メンターとして活動しています。"
    },
];
