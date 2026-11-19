import type { L10n } from "@/shared/lib/i18n";

export type SocialLink = {
  href: string;
  imgSrc: string;
  label: string;
};

// ホーム画面のプロフィールに表示するソーシャルリンク（ロゴ画像のみ）
// ロゴはすべて黒い画像のため、表示側は明るい背景の上に乗せること
export const socialLinks: SocialLink[] = [
  {
    href: "https://twitter.com/javalangruntime",
    imgSrc: "/x_home.png",
    label: "X",
  },
  {
    href: "https://www.instagram.com/manjiin773tara/",
    imgSrc: "/instagram_home.png",
    label: "Instagram",
  },
  {
    href: "https://github.com/javalangruntimeexception",
    imgSrc: "/github_home.png",
    label: "GitHub",
  },
  {
    href: "https://www.linkedin.com/in/javalangruntimeexception/",
    imgSrc: "/linkedin_home.png",
    label: "LinkedIn",
  },
  {
    href: "https://www.credly.com/users/javalangruntimeexception",
    imgSrc: "/credly_home.svg",
    label: "Credly",
  },
  {
    href: "https://orcid.org/0009-0005-4751-648X",
    imgSrc: "/ORCID_home.png",
    label: "ORCID",
  },
];

// 検索・AI が「誰で、何をしている人か」を引用するための表記。
// 英語はトップに出している肩書き、日本語はその同じ肩書き。
// 日本語名の漢字は「柊太」（柊は U+67CA）。llms.txt と index.html も同じ字にする。
export const personName = {
  en: "Shuta Tanahashi",
  ja: "棚橋 柊太",
  handle: "taramanji",
} as const;

export const personRoles: { en: string; ja: string }[] = [
  { en: "Software Engineer", ja: "ソフトウェアエンジニア・開発者" },
  { en: "Backend Engineer", ja: "バックエンドエンジニア" },
  { en: "Photographer", ja: "フォトグラファー" },
  { en: "XR Researcher", ja: "XR研究者" },
  { en: "Community Manager", ja: "コミュニティマネージャー" },
];

export const personTitle = "taramanji";

// 屋号。個人の名前・ハンドルとは別に、この表記のまま書く。
export const tradeName = "taramanji code";

export const personDescription =
  "Shuta Tanahashi (taramanji) is a software engineer and developer, backend engineer, photographer, XR researcher, and community manager.";

export type TaglineLine = {
  text: string;
  // アクセント色にする文字の範囲 [start, end)
  accent: [number, number];
};

// キャッチコピー（入り口の演出とトップのプロフィールで使う）
export const tagline: L10n<{ lines: TaglineLine[]; subtitle: string }> = {
  ja: {
    lines: [
      { text: "技術を価値に、", accent: [3, 5] }, // 価値
      { text: "好きを居場所に。", accent: [3, 6] }, // 居場所
    ],
    subtitle: "好きな技術を、誰かの価値と居場所に変えられる技術者へ。",
  },
  en: {
    lines: [
      { text: "Tech into value,", accent: [10, 15] }, // value
      { text: "passion into belonging.", accent: [13, 22] }, // belonging
    ],
    subtitle: "Becoming an engineer who turns the technology I love into value and a place to belong for others.",
  },
};
