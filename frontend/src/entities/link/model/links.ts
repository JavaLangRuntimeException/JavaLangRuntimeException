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
  // Portfolio → Home
  { href: "/", imgSrc: "/profile_taramanji.png", title: "Home", description: { ja: "ホームの画面へ", en: "Go to the home page" }, backText: { ja: "ホームへ", en: "Home" } },
  // Twitter
  {
    href: "https://twitter.com/javalangruntime",
    imgSrc: "/twitter.png",
    title: "X (Twitter)",
    description: "@JavaLangRuntime",
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
    description: "@JavaLangRuntime",
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
    description: "@JavaLangRuntimeException",
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
  // Teratail
  { href: "https://teratail.com/users/JavaLangRuntime", imgSrc: "/teratail.png", title: "Teratail", description: "@JavaLangRuntime", backText: "Q&A" },
  // 1on1予約
  {
    href: "/reserve",
    imgSrc: "/image2.png",
    title: { ja: "お打ち合わせ予約", en: "Book a Meeting" },
    description: { ja: "お打ち合わせのの予約はこちら", en: "Book a meeting here" },
    backText: { ja: "なんでも話しましょう！", en: "Let's talk about anything!" },
  },
  {
    title: { ja: "お問い合わせ", en: "Contact" },
    description: "Contact Form",
    href: "/contact",
    imgSrc: "/mail.png",
    backText: {
      ja: "お問い合わせフォームから\nご連絡いただけます。\n\nご質問やご相談が\nございましたら\nお気軽にどうぞ。",
      en: "You can reach me through\nthe contact form.\n\nFeel free to send\nany questions or requests.",
    },
  },
];
