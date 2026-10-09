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
    label: "X (Twitter)",
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
    href: "https://orcid.org/0009-0005-4751-648X",
    imgSrc: "/ORCID_home.png",
    label: "ORCID",
  },
];

export type TaglineLine = {
  text: string;
  // アクセント色にする文字の範囲 [start, end)
  accent: [number, number];
};

// キャッチコピー（入り口の演出とトップのプロフィールで使う）
export const tagline: { lines: TaglineLine[]; subtitle: string } = {
  lines: [
    { text: "技術を価値に、", accent: [3, 5] }, // 価値
    { text: "好きを居場所に。", accent: [3, 6] }, // 居場所
  ],
  subtitle: "好きな技術を、誰かの価値と居場所に変えられる技術者へ。",
};
