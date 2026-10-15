import type { L10n } from "@/shared/lib/i18n";

export type AffiliationCategory =
    | "university_research"
    | "community"
    | "engineer"
    | "photographer"
    | "community_director"
    | "event_management"
    | "conference_staff"
    | "technical_mentor";

export type Affiliation = {
    label: L10n;
    color: string;
    href?: string;
    category: AffiliationCategory;
    description?: L10n;
};

export const affiliations: Affiliation[] = [
    // university_research
    {
        label: { ja: "立命館大学大学院情報理工学研究科情報理工学専攻人間情報科学コース", en: "Ritsumeikan University, Graduate School of Information Science and Engineering, Human Information Science Course" },
        color: "bg-red-600",
        href: "https://www.ritsumei.ac.jp/",
        category: "university_research",
        description: {
            ja: "立命館大学大学院情報理工学研究科人間情報科学コースにて、コンピュータサイエンスとエンジニアリングを学んでいます。",
            en: "Studying computer science and engineering in the Human Information Science Course, Graduate School of Information Science and Engineering, Ritsumeikan University.",
        }
    },
    {
        label: { ja: "リアリティメディア & モバイルコンピューティング研究室(RM2C)", en: "Reality Media & Mobile Computing Lab (RM2C)" },
        color: "bg-blue-600",
        href: "https://www.rm2c.ise.ritsumei.ac.jp/",
        category: "university_research",
        description: {
            ja: "VR/AR/MRなどのXRシステムに関する位置推定技術やクライアント間の通信に関する研究や、XR環境を使用したヒューマンインターフェースなど心理学実験を行っています。",
            en: "Researching localization and client-to-client communication for XR systems such as VR/AR/MR, and running psychology experiments on human interfaces in XR environments.",
        }
    },
    {
        label: { ja: "クラスター株式会社 Research Assistant", en: "Cluster, Inc. Research Assistant" },
        color: "bg-blue-500",
        href: "https://cluster.mu/",
        category: "university_research",
        description: {
            ja: "バーチャルリアリティプラットフォームを活用した人間拡張や仮想と現実のインタラクションの研究に関してのリサーチアシスタントをしています。",
            en: "Working as a research assistant on human augmentation and virtual\u2013real interaction using a virtual reality platform.",
        }
    },

    // community
    {
        label: { ja: "学術部公認団体 立命館コンピュータクラブ(RCC)", en: "Ritsumeikan Computer Club (RCC)" },
        color: "bg-red-600",
        href: "http://www.rcc.ritsumei.ac.jp/",
        category: "community",
        description: {
            ja: "立命館大学学術部公認団体として、コンピュータ技術の研究・学習活動を行っています。",
            en: "An officially recognized academic club at Ritsumeikan University that studies and researches computer technology.",
        }
    },
    {
        label: { ja: "学生エンジニアコミュニティSTECH", en: "STECH Student Engineer Community" },
        color: "bg-sky-600",
        href: "https://stech.jinnen.co.jp/",
        category: "community",
        description: {
            ja: "上位1%の学生エンジニアが集う審査制コミュニティSTECHの運営に携わっています。",
            en: "Helping run STECH, a selective community for the top 1% of student engineers.",
        }
    },
    {
        label: { ja: "CATechLounge", en: "CATechLounge" },
        color: "bg-cyan-600",
        href: "https://www.cyberagent.co.jp/careers/special/students/tech_lounge/",
        category: "community",
        description: {
            ja: "株式会社サイバーエージェントが運営する学生向け技術コミュニティに参加しています。",
            en: "A member of the student tech community run by CyberAgent, Inc.",
        }
    },

    // engineer
    {
        label: { ja: "株式会社サイバーエージェント", en: "CyberAgent, Inc." },
        color: "bg-lime-600",
        href: "https://www.cyberagent.co.jp/",
        category: "engineer",
        description: {
            ja: "株式会社サイバーエージェントのサーバーサイドエンジニアとして、技術開発に取り組んでいます。",
            en: "Working on technology development as a server-side engineer at CyberAgent, Inc.",
        }
    },
    {
        label: { ja: "JINEN株式会社 Engineer", en: "JINEN Inc. Engineer" },
        color: "bg-blue-900",
        href: "https://jinnen.co.jp/",
        category: "engineer",
        description: {
            ja: "各種コミュニティに必要なツールの開発を行っています。",
            en: "Building the tools that various communities need.",
        }
    },
    {
        label: { ja: "株式会社888 受託開発事業部長", en: "888 Inc. Head of Contract Development" },
        color: "bg-yellow-900",
        href: "https://888incs.com",
        category: "engineer",
        description: {
            ja: "関西地域のDX案件に関するプロジェクトのPMを行っています",
            en: "Managing digital transformation projects in the Kansai region.",
        }
    },

    // photographer
    {
        label: { ja: "フリーランスカメラマン", en: "Freelance Photographer" },
        color: "bg-pink-600",
        href: "https://www.instagram.com/manjiin773tara/",
        category: "photographer",
        description: {
            ja: "フリーランスカメラマンとして出張撮影を承ります。ポートレート、イベント撮影、テックカンファレンス撮影スタッフなど幅広く対応可能です。",
            en: "Available as a freelance photographer for on-location shoots, including portraits, events, and tech-conference photography.",
        }
    },

    // community_director / organizer
    {
        label: { ja: "JINEN株式会社 STECH Community Director", en: "JINEN Inc. STECH Community Director" },
        color: "bg-blue-900",
        href: "https://jinnen.co.jp/",
        category: "community_director",
        description: {
            ja: "学生エンジニアコミュニティSTECHの運営サポートや各種コミュニティの運営・企画やコミュニティに関する営業を行っています。",
            en: "Supporting the operation of the STECH student engineer community, planning and running various communities, and doing community-related business development.",
        }
    },

    {
        label: { ja: "kyoto.go Organizer", en: "kyoto.go Organizer" },
        color: "bg-violet-600",
        href: "https://x.com/kyotogolang",
        category: "community_director",
        description: {
            ja: "京都のGo当地コミュニティを主催し、定期的な勉強会やイベントを開催しています。",
            en: "Organizing the local Go community in Kyoto, with regular study sessions and events.",
        }
    },
    {
        label: { ja: "biwako.go Organizer", en: "biwako.go Organizer" },
        color: "bg-amber-800",
        href: "https://x.com/biwakogolang",
        category: "community_director",
        description: {
            ja: "滋賀のGo当地コミュニティを主催し、定期的な勉強会やイベントを開催しています。",
            en: "Organizing the local Go community in Shiga, with regular study sessions and events.",
        }
    },

    // event_management
    {
        label: { ja: "特定非営利活動法人NxTEND 戦略事業本部", en: "NxTEND (NPO) Strategic Business Division" },
        color: "bg-amber-600",
        href: "https://www.nxtend.or.jp/",
        category: "event_management",
        description: {
            ja: "NxTENDにて各地域のエンジニアコミュニティを活性化するための事業の企画・運営を行っています。",
            en: "Planning and running programs at NxTEND that energize regional engineer communities.",
        }
    },

    // conference_staff
    {
        label: { ja: "GoConference Staff", en: "GoConference Staff" },
        color: "bg-sky-600",
        href: "https://gocon.jp/",
        category: "conference_staff",
        description: {
            ja: "Go言語に関するカンファレンスであるGoConferenceの運営スタッフとして参加しています。",
            en: "Volunteering as organizing staff for GoConference, a conference about the Go language.",
        }
    },
    {
        label: { ja: "GoWorkshopConference Staff", en: "GoWorkshopConference Staff" },
        color: "bg-fuchsia-600",
        href: "https://gwc.gocon.jp/",
        category: "conference_staff",
        description: {
            ja: "Go言語に関するワークショップイベントであるGoWorkshopConferenceの企画・運営に携わっています。",
            en: "Helping plan and run GoWorkshopConference, a workshop event about the Go language.",
        }
    },
    {
        label: { ja: "TSKaigi Staff", en: "TSKaigi Staff" },
        color: "bg-cyan-600",
        href: "https://tskaigi.org/",
        category: "conference_staff",
        description: {
            ja: "TypeScriptカンファレンスであるTSKaigiの運営スタッフとして活動しています。",
            en: "Volunteering as organizing staff for TSKaigi, a TypeScript conference.",
        }
    },

    // technical_mentor
    {
        label: { ja: "株式会社ローカルイノベーション(TechSelect+ 技術メンター)", en: "Local Innovation Co., Ltd. (TechSelect+ Technical Mentor)" },
        color: "bg-lime-600",
        href: "https://local-innovation.com/",
        category: "technical_mentor",
        description: {
            ja: "学生エンジニアの技術的な成長をサポートするTechSelect+の技術メンターとして活動しています。",
            en: "Serving as a technical mentor for TechSelect+, which supports the technical growth of student engineers.",
        }
    },
];
