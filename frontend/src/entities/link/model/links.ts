import type { L10n } from "@/shared/lib/i18n";

/** 言語で変わらない文字（ハンドル名など）は文字列のまま */
type Text = string | L10n;

export type LinkCard = {
  href: string;
  imgSrc: string;
  title: Text;
  description: Text;
  backText?: Text;
};

export const linkCards: LinkCard[] = [
  // Twitter
  {
    href: "https://twitter.com/javalangruntime",
    imgSrc: "/twitter.png",
    title: "X (Twitter)",
    description: {
      ja: "@JavaLangRuntime — 技術・登壇・イベントの近況を発信しています",
      en: "@JavaLangRuntime — updates on tech, talks and events",
    },
  },
  // Instagram
  {
    href: "https://www.instagram.com/manjiin773tara/",
    imgSrc: "/instagram.jpeg",
    title: "Instagram",
    description: "@manjiin773tara",
  },
  // MIXI2
  {
    href: "https://mixi.social/@JavaLangRuntime",
    imgSrc: "/mixi2.png",
    title: "MiXi2",
    description: {
      ja: "@JavaLangRuntime — 日々のつぶやきやコミュニティでの交流",
      en: "@JavaLangRuntime — everyday posts and community chat",
    },
  },
  // GitHub
  {
    href: "https://github.com/javalangruntimeexception",
    imgSrc: "/github.png",
    title: "GitHub",
    description: {
      ja: "@JavaLangRuntimeException — 開発中のプロダクトやソースコードを公開しています",
      en: "@JavaLangRuntimeException — source code for products I build",
    },
  },
  // LinkedIn
  {
    href: "https://www.linkedin.com/in/javalangruntimeexception/",
    imgSrc: "/linkedin.png",
    title: "LinkedIn",
    description: "Profile",
  },
  // Credly
  {
    href: "https://www.credly.com/users/javalangruntimeexception",
    imgSrc: "/credly.svg",
    title: "Credly",
    description: "@javalangruntimeexception",
  },
  // Qiita
  {
    href: "/blogs",
    imgSrc: "/qiita.png",
    title: "Published Articles(Qiita)",
    description: "@JavaLangRuntimeException",
  },
  // Speaker Deck
  {
    href: "https://speakerdeck.com/javalangruntimeexception",
    imgSrc: "/speakerdeck.jpeg",
    title: "Speaker Deck",
    description: "@JavaLangRuntimeException",
  },
  // ORCID
  {
    href: "https://orcid.org/0009-0005-4751-648X",
    imgSrc: "/ORCID_logo.png",
    title: "ORCID",
    description: "0009-0005-4751-648X",
  },
  // Google Scholar
  {
    href: "https://scholar.google.co.jp/citations?user=Sr7nBe8AAAAJ",
    imgSrc: "/google_scholar.svg",
    title: "Google Scholar",
    description: { ja: "論文と被引用数", en: "Papers and citations" },
  },
  // Teratail
  {
    href: "https://teratail.com/users/JavaLangRuntime",
    imgSrc: "/teratail.png",
    title: "Teratail",
    description: "@JavaLangRuntime",
  },
];
