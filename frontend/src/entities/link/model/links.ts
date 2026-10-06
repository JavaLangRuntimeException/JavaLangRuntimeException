export type LinkCard = {
  href: string;
  imgSrc: string;
  title: string;
  description: string;
  backText: string;
};

// 複数アカウントのカレンダー同期の管理画面（gws.taramanji.com は /admin 専用。k8s/calendar-sync/README.md）
export const CALENDAR_SYNC_URL = "https://gws.taramanji.com/admin";

export const linkCards: LinkCard[] = [
  // Portfolio → Home
  { href: "/", imgSrc: "/image.png", title: "Home", description: "ホームの画面へ", backText: "ホームへ" },
  // Twitter
  { href: "https://twitter.com/javalangruntime", imgSrc: "/twitter.png", title: "X (Twitter)", description: "@JavaLangRuntime", backText: "なぜJavaの実行時のエラーにしたか？" },
  // Instagram
  { href: "https://www.instagram.com/manjiin773tara/", imgSrc: "/instagram.jpeg", title: "Instagram", description: "@manjiin773tara", backText: "カメラマンとしての活動を投稿しています" },
  // MIXI2
  { href: "https://mixi.social/@JavaLangRuntime", imgSrc: "/mixi2.png", title: "MiXi2", description: "@JavaLangRuntime", backText: "それは私が一番みたエラーだからです(本音はJavaLangRuntimeExceptionを調べたエンジニアがこのサイトに来る誘導...?)" },
  // GitHub
  { href: "https://github.com/javalangruntimeexception", imgSrc: "/github.png", title: "GitHub", description: "@JavaLangRuntimeException", backText: "実はJavaLangRuntimeExceptionは結構な種類があるよ！" },
  // LinkedIn
  { href: "https://www.linkedin.com/in/javalangruntimeexception/", imgSrc: "/linkedin.png", title: "LinkedIn", description: "Profile", backText: "つながりましょう" },
  // Qiita
  { href: "/blogs", imgSrc: "/qiita.png", title: "Published Articles(Qiita)", description: "@JavaLangRuntimeException", backText: "記事一覧" },
  // Speaker Deck
  { href: "https://speakerdeck.com/javalangruntimeexception", imgSrc: "/speakerdeck.jpeg", title: "Speaker Deck", description: "@JavaLangRuntimeException", backText: "登壇スライド" },
  // ORCID
  { href: "https://orcid.org/0009-0005-4751-648X", imgSrc: "/ORCID_logo.png", title: "ORCID", description: "0009-0005-4751-648X", backText: "出した論文ここに記載します" },
  // Teratail
  { href: "https://teratail.com/users/JavaLangRuntime", imgSrc: "/teratail.png", title: "Teratail", description: "@JavaLangRuntime", backText: "Q&A" },
  // 1on1予約
  { href: "/reserve", imgSrc: "/image2.png", title: "お打ち合わせ予約", description: "お打ち合わせのの予約はこちら", backText: "なんでも話しましょう！" },
  // カレンダー同期（オンプレ k8s）
  { href: CALENDAR_SYNC_URL, imgSrc: "/gws-calendar.svg", title: "カレンダー同期", description: "複数の Google カレンダーを同期", backText: "仕事も個人も、すべての\nカレンダーの予定を\nひとつにまとめます。\n\n（管理者のみ）" },
  {
    title: "お問い合わせ",
    description: "Contact Form",
    href: "/contact",
    imgSrc: "/mail.png",
    backText: "お問い合わせフォームから\nご連絡いただけます。\n\nご質問やご相談が\nございましたら\nお気軽にどうぞ。"
  }
];

