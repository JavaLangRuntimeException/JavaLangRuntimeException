export type SocialLink = {
  href: string;
  imgSrc: string;
  label: string;
};

// ホーム画面のプロフィールに表示するソーシャルリンク（ロゴ画像のみ）
// ロゴはすべて黒い画像のため、表示側は明るい背景の上に乗せること
export const socialLinks: SocialLink[] = [
  { href: "https://twitter.com/javalangruntime", imgSrc: "/x_home.jpg", label: "X (Twitter)" },
  { href: "https://www.instagram.com/manjiin773tara/", imgSrc: "/instagram_home.png", label: "Instagram" },
  { href: "https://github.com/javalangruntimeexception", imgSrc: "/github_home.png", label: "GitHub" },
  { href: "https://orcid.org/0009-0005-4751-648X", imgSrc: "/ORCID_home.png", label: "ORCID" },
];
