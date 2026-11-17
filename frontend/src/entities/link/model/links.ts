import type { L10n } from "@/shared/lib/i18n";

/** 言語で変わらない文字（ハンドル名など）は文字列のまま */
type Text = string | L10n;

export type LinkCard = {
  href: string;
  imgSrc: string;
  title: Text;
  description: Text;
  backText: Text;
};

export const linkCards: LinkCard[] = [
  // Twitter
  {
    href: "https://twitter.com/javalangruntime",
    imgSrc: "/twitter.png",
    title: "X (Twitter)",
    description: { ja: "@JavaLangRuntime — 技術・登壇・イベントの近況を発信しています", en: "@JavaLangRuntime — updates on tech, talks and events" },
    backText: { ja: "なぜJavaの実行時のエラーにしたか？", en: "Why name myself after a Java runtime error?" },
  },
  // Instagram
  {
    href: "https://www.instagram.com/manjiin773tara/",
    imgSrc: "/instagram.jpeg",
    title: "Instagram",
    description: "@manjiin773tara",
    backText: { ja: "カメラマンとしての活動を投稿しています", en: "Posting my work as a photographer" },
  },
  // MIXI2
  {
    href: "https://mixi.social/@JavaLangRuntime",
    imgSrc: "/mixi2.png",
    title: "MiXi2",
    description: { ja: "@JavaLangRuntime — 日々のつぶやきやコミュニティでの交流", en: "@JavaLangRuntime — everyday posts and community chat" },
    backText: {
      ja: "それは私が一番みたエラーだからです(本音はJavaLangRuntimeExceptionを調べたエンジニアがこのサイトに来る誘導...?)",
      en: "Because it's the error I've seen the most (honestly, maybe a way to lure engineers who search for JavaLangRuntimeException to this site...?)",
    },
  },
  // GitHub
  {
    href: "https://github.com/javalangruntimeexception",
    imgSrc: "/github.png",
    title: "GitHub",
    description: { ja: "@JavaLangRuntimeException — 開発中のプロダクトやソースコードを公開しています", en: "@JavaLangRuntimeException — source code for products I build" },
    backText: { ja: "実はJavaLangRuntimeExceptionは結構な種類があるよ！", en: "Fun fact: there are quite a few kinds of JavaLangRuntimeException!" },
  },
  // LinkedIn
  {
    href: "https://www.linkedin.com/in/javalangruntimeexception/",
    imgSrc: "/linkedin.png",
    title: "LinkedIn",
    description: "Profile",
    backText: { ja: "つながりましょう", en: "Let's connect" },
  },
  // Credly
  {
    href: "https://www.credly.com/users/javalangruntimeexception",
    imgSrc: "/credly.svg",
    title: "Credly",
    description: "@javalangruntimeexception",
    backText: { ja: "取得した資格のバッジ", en: "Badges for my certifications" },
  },
  // Qiita
  {
    href: "/blogs",
    imgSrc: "/qiita.png",
    title: "Published Articles(Qiita)",
    description: "@JavaLangRuntimeException",
    backText: { ja: "記事一覧", en: "All articles" },
  },
  // Speaker Deck
  {
    href: "https://speakerdeck.com/javalangruntimeexception",
    imgSrc: "/speakerdeck.jpeg",
    title: "Speaker Deck",
    description: "@JavaLangRuntimeException",
    backText: { ja: "登壇スライド", en: "Talk slides" },
  },
  // ORCID
  {
    href: "https://orcid.org/0009-0005-4751-648X",
    imgSrc: "/ORCID_logo.png",
    title: "ORCID",
    description: "0009-0005-4751-648X",
    backText: { ja: "出した論文ここに記載します", en: "My published papers are listed here" },
  },
  // Google Scholar
  {
    href: "https://scholar.google.co.jp/citations?user=Sr7nBe8AAAAJ",
    imgSrc: "/google_scholar.svg",
    title: "Google Scholar",
    description: { ja: "論文と被引用数", en: "Papers and citations" },
    backText: { ja: "研究業績の一覧", en: "My research publications" },
  },
  // Teratail
  { href: "https://teratail.com/users/JavaLangRuntime", imgSrc: "/teratail.png", title: "Teratail", description: "@JavaLangRuntime", backText: "Q&A" },
];
