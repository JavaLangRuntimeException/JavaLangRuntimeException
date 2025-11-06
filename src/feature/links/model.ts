export type LinkCard = {
  href: string;
  imgSrc: string;
  title: string;
  description: string;
  backText: string;
};

export const linkCards: LinkCard[] = [
  // Portfolio → Home
  { href: "/", imgSrc: "/image.png", title: "Home", description: "ホームの画面へ", backText: "ホームへ" },
  // Twitter
  { href: "https://twitter.com/javalangruntime", imgSrc: "/twitter.png", title: "X (Twitter)", description: "@JavaLangRuntime", backText: "なぜJavaの実行時のエラーにしたか？" },
  // MIXI2
  { href: "https://mixi.social/@JavaLangRuntime", imgSrc: "/mixi2.png", title: "MiXi2", description: "@JavaLangRuntime", backText: "それは私が一番みたエラーだからです(本音はJavaLangRuntimeExceptionを調べたエンジニアがこのサイトに来る誘導...?)" },
  // GitHub
  { href: "https://github.com/javalangruntimeexception", imgSrc: "/github.png", title: "GitHub", description: "@JavaLangRuntimeException", backText: "実はJavaLangRuntimeExceptionは結構な種類があるよ！" },
  // AtCoder → LinkedIn
  { href: "https://www.linkedin.com/in/javalangruntimeexception/", imgSrc: "/linkedin.png", title: "LinkedIn", description: "Profile", backText: "つながりましょう" },
  // Qiita
  { href: "/blogs", imgSrc: "/qiita.png", title: "Published Articles(Qiita)", description: "@JavaLangRuntimeException", backText: "記事一覧" },
  // Speaker Deck
  { href: "https://speakerdeck.com/javalangruntimeexception", imgSrc: "/speakerdeck.jpeg", title: "Speaker Deck", description: "@JavaLangRuntimeException", backText: "登壇スライド" },
  // Teratail
  { href: "https://teratail.com/users/JavaLangRuntime", imgSrc: "/teratail.png", title: "Teratail", description: "@JavaLangRuntime", backText: "Q&A" },
  // StackOverflow → 1on1予約
  { href: "/reserve", imgSrc: "/image2.png", title: "お打ち合わせ予約", description: "お打ち合わせのの予約はこちら", backText: "なんでも話しましょう！" },
  {
    title: "お問い合わせ",
    description: "Contact Form",
    href: "/contact",
    imgSrc: "/mail.png",
    backText: "お問い合わせフォームから\nご連絡いただけます。\n\nご質問やご相談が\nございましたら\nお気軽にどうぞ。"
  }
];

