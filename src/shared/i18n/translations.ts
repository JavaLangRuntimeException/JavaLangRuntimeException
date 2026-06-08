export type Lang = "ja" | "en";

export const translations = {
  // ========== Header / Marquee ==========
  header: {
    slotLabel: {
      ja: "直近相談予約可能時間",
      en: "Next available consultation",
    },
    slotLoading: {
      ja: "取得中…",
      en: "Loading…",
    },
    slotError: {
      ja: "取得できませんでした",
      en: "Could not load",
    },
    workLocation: {
      ja: "勤務場所",
      en: "Work Location",
    },
    undecided: {
      ja: "未定",
      en: "TBD",
    },
    consultHours: {
      ja: "相談可能時間: 9:00 - 23:00",
      en: "Consultation hours: 9:00 - 23:00",
    },
    marqueeInfo: {
      ja: "Links ではプロフィール・SNS・連絡先を掲載中。Contact ではお問い合わせが可能です。Ask Meでは面談予約が可能です。面談の変更・取消は EventID を添えてお問い合わせください。",
      en: "Links has profile, SNS & contact info. Contact for inquiries. Ask Me for meeting reservations. To change/cancel a meeting, contact with your EventID.",
    },
  },

  // ========== Weekday names ==========
  weekdays: {
    short: {
      ja: ["日", "月", "火", "水", "木", "金", "土"],
      en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    },
    mondayStart: {
      ja: ["月", "火", "水", "木", "金", "土", "日"],
      en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    },
  },

  // ========== Home page ==========
  home: {
    linksDesc: {
      ja: "プロフィール・SNSのリンク一覧",
      en: "Profile & SNS links",
    },
    workSpotDesc: {
      ja: "勤務場所の予定\n今日以降の勤務予定地を確認",
      en: "Work spot schedule\nCheck planned work locations",
    },
    contactDesc: {
      ja: "お問い合わせフォーム\nご質問・ご相談はこちらから",
      en: "Contact form\nQuestions & inquiries here",
    },
    askMeDesc: {
      ja: "ご相談・面談予約ページ\nご希望の日時を選択してください",
      en: "Consultation & meeting booking\nSelect your preferred date & time",
    },
  },

  // ========== Links page ==========
  links: {
    title: {
      ja: "リンク集",
      en: "Links",
    },
    affiliationNote: {
      ja: "※ 所属組織の公式サイトへのリンクは、トップページの「🏢 Affiliation」セクションにある各タグをクリックすると表示されます。",
      en: "* Links to affiliated organizations can be found by clicking each tag in the \"🏢 Affiliation\" section on the top page.",
    },
  },

  // ========== Location page ==========
  location: {
    title: {
      ja: "勤務場所",
      en: "Work Location",
    },
    subtitle: {
      ja: "今日以降の勤務予定場所です",
      en: "Planned work locations from today onwards",
    },
    published: {
      ja: "最短2ヶ月先まで公開しています",
      en: "Published up to 2 months ahead",
    },
    useAskMe: {
      ja: "ページでの対面でのお問い合わせにご活用ください",
      en: " page to plan in-person meetings",
    },
    fetchError: {
      ja: "データの取得に失敗しました",
      en: "Failed to load data",
    },
    yearMonth: {
      ja: (y: number, m: number) => `${y}年${m}月`,
      en: (y: number, m: number) => {
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${months[m - 1]} ${y}`;
      },
    },
    thisMonth: {
      ja: "今月",
      en: "This Month",
    },
    noLocationToday: {
      ja: "今日の勤務場所は未登録です",
      en: "No location registered for today",
    },
    clickToCheck: {
      ja: "日付をクリックして確認",
      en: "Click a date to check",
    },
    today: {
      ja: "今日",
      en: "Today",
    },
    selected: {
      ja: "選択中",
      en: "Selected",
    },
    past: {
      ja: "過去（選択不可）",
      en: "Past (not selectable)",
    },
    noLocations: {
      ja: "勤務場所の登録がありません",
      en: "No work locations registered",
    },
  },

  // ========== Location names ==========
  locationNames: {
    "滋賀県草津市": { ja: "滋賀県草津市", en: "Kusatsu, Shiga" },
    "滋賀県（草津市以外）": { ja: "滋賀県（草津市以外）", en: "Shiga (other)" },
    "京都府京都市": { ja: "京都府京都市", en: "Kyoto City" },
    "京都府（京都市以外）": { ja: "京都府（京都市以外）", en: "Kyoto (other)" },
    "大阪府大阪市": { ja: "大阪府大阪市", en: "Osaka City" },
    "大阪府茨木市": { ja: "大阪府茨木市", en: "Ibaraki, Osaka" },
    "大阪府（大阪市・茨木市以外）": { ja: "大阪府（大阪市・茨木市以外）", en: "Osaka (other)" },
    "東京都渋谷区": { ja: "東京都渋谷区", en: "Shibuya, Tokyo" },
    "東京都（渋谷区以外）": { ja: "東京都（渋谷区以外）", en: "Tokyo (other)" },
    "愛知県名古屋市": { ja: "愛知県名古屋市", en: "Nagoya, Aichi" },
    "愛知県（名古屋市以外）": { ja: "愛知県（名古屋市以外）", en: "Aichi (other)" },
    "岐阜県": { ja: "岐阜県", en: "Gifu" },
    "リモート": { ja: "リモート", en: "Remote" },
    "未定（お問い合わせください）": { ja: "未定（お問い合わせください）", en: "TBD (contact us)" },
    "対応不可日・休日": { ja: "対応不可日・休日", en: "Unavailable / Holiday" },
  } as Record<string, { ja: string; en: string }>,

  // ========== Contact page ==========
  contact: {
    title: {
      ja: "お問い合わせ",
      en: "Contact",
    },
    subtitle: {
      ja: "ご質問やご相談がございましたら、お気軽にお問い合わせください。",
      en: "Feel free to reach out with any questions or inquiries.",
    },
    responseTime: {
      ja: "お問い合わせ対応時間:",
      en: "Response hours:",
    },
    responsePromise: {
      ja: "お問い合わせいただいてから1週間以内にお返事いたします",
      en: "We will reply within one week of your inquiry",
    },
    fileAttachment: {
      ja: "ファイル添付について",
      en: "About File Attachments",
    },
    fileMax: {
      ja: "• 最大5個までファイルを添付できます",
      en: "• Up to 5 files can be attached",
    },
    fileSize: {
      ja: "• 1ファイルあたり3MB以下にしてください",
      en: "• Each file must be 3MB or less",
    },
    fileFormat: {
      ja: "• ファイル形式は問いません",
      en: "• Any file format is accepted",
    },
    fileLarge: {
      ja: "• ファイルサイズが大きい場合は、GoogleDriveやOneDriveなどのクラウドストレージにアップロードして共有リンクを本文に記載してください",
      en: "• For large files, upload to cloud storage (Google Drive, OneDrive, etc.) and include the link in your message",
    },
    submitted: {
      ja: "お問い合わせを受け付けました",
      en: "Inquiry Received",
    },
    thankYou: {
      ja: "お問い合わせありがとうございます。",
      en: "Thank you for your inquiry.",
    },
    confirmEmail: {
      ja: "確認メールをお送りいたしました。\nスパム(迷惑)メールも合わせてご確認ください。",
      en: "A confirmation email has been sent.\nPlease also check your spam folder.",
    },
    replyNote: {
      ja: "※1週間以内にこちらから再度連絡いたします。",
      en: "* We will follow up within one week.",
    },
    countdown: {
      ja: (n: number) => `${n}秒後に自動で閉じます`,
      en: (n: number) => `Closing automatically in ${n} seconds`,
    },
  },

  // ========== Contact Form ==========
  contactForm: {
    emailLabel: {
      ja: "メールアドレス",
      en: "Email Address",
    },
    nameLabel: {
      ja: "名前",
      en: "Name",
    },
    orgLabel: {
      ja: "所属 (任意)",
      en: "Organization (optional)",
    },
    subjectLabel: {
      ja: "件名",
      en: "Subject",
    },
    purposeLabel: {
      ja: "問い合わせ要件",
      en: "Inquiry Type",
    },
    selectPlaceholder: {
      ja: "選択してください",
      en: "Please select",
    },
    messageLabel: {
      ja: "本文",
      en: "Message",
    },
    fileLabel: {
      ja: "ファイル添付 (任意)",
      en: "File Attachments (optional)",
    },
    attachedFiles: {
      ja: "添付ファイル:",
      en: "Attached files:",
    },
    submitting: {
      ja: "送信中...",
      en: "Sending...",
    },
    submit: {
      ja: "送信する",
      en: "Submit",
    },
    sending: {
      ja: "お問い合わせを送信中",
      en: "Sending inquiry",
    },
    sendingMsg: {
      ja: "お問い合わせを送信しています…",
      en: "Sending your inquiry…",
    },
    inputRetained: {
      ja: "入力内容は10分間保持されます",
      en: "Your input is retained for 10 minutes",
    },
    formDisclaimer: {
      ja: "フォームに入力いただいた内容はご相談や面談の予約確認の目的でのみ使用されます。",
      en: "Form data is used only for consultation and meeting reservation purposes.",
    },
    required: {
      ja: "は必須項目です",
      en: "are required fields",
    },
    namePlaceholder: {
      ja: "山田太郎",
      en: "John Doe",
    },
    orgPlaceholder: {
      ja: "株式会社○○",
      en: "Company Inc.",
    },
    subjectPlaceholder: {
      ja: "お問い合わせの件名",
      en: "Subject of your inquiry",
    },
    messagePlaceholder: {
      ja: "お問い合わせ内容を詳しくお書きください",
      en: "Please describe your inquiry in detail",
    },
    validationError: {
      ja: "必須項目を正しく入力してください",
      en: "Please fill in all required fields correctly",
    },
    fileValidationError: {
      ja: "ファイルエラーを修正してください",
      en: "Please fix the file errors",
    },
    sendError: {
      ja: "送信に失敗しました。もう一度お試しください。",
      en: "Failed to send. Please try again.",
    },
    emailSendError: {
      ja: "メール送信に失敗しました。しばらく時間をおいてから再度お試しください。",
      en: "Failed to send email. Please try again later.",
    },
    missingFields: {
      ja: "必須項目が入力されていません。すべての必須項目をご入力ください。",
      en: "Required fields are missing. Please fill in all required fields.",
    },
    invalidEmail: {
      ja: "メールアドレスの形式が正しくありません。",
      en: "Invalid email format.",
    },
    tooManyFiles: {
      ja: "ファイルは最大5個まで添付できます。",
      en: "You can attach up to 5 files.",
    },
    fileTooLarge: {
      ja: "ファイルサイズが大きすぎます。1ファイルあたり3MB以下にしてください。",
      en: "File too large. Each file must be 3MB or less.",
    },
    fileMaxError: {
      ja: "ファイルは最大5個まで添付できます",
      en: "You can attach up to 5 files",
    },
    fileSizeError: {
      ja: (name: string) => `${name}: ファイルサイズは3MB以下にしてください`,
      en: (name: string) => `${name}: File must be 3MB or less`,
    },
    fileDuplicateError: {
      ja: (name: string) => `${name}: 同じファイル名のファイルが既に添付されています`,
      en: (name: string) => `${name}: A file with the same name is already attached`,
    },
    eventIdLabel: {
      ja: "EventID",
      en: "EventID",
    },
    eventIdHelp: {
      ja: "面談予約完了の際に表示されたEventIDを入力してください。\n（招待されたGoogleカレンダーやメールにも記載されています）",
      en: "Enter the EventID shown when your meeting was booked.\n(Also found in the Google Calendar invitation or email)",
    },
  },

  // ========== Purposes ==========
  purposes: {
    labels: {
      ja: {
        "TechSelect+": "TechSelect+の面談",
        "STECH": "学生エンジニアコミュニティSTECHに関するご相談や面談",
        "JINEN": "コミュニティ運営全般や学生エンジニア向けイベントに関するご相談(JINEN)",
        "NxTEND_Event": "NxTEND主催のイベントやコミュニティに関するご相談",
        "NxTEND_Organize": "NxTEND運営参加に関するご相談",
        "biwako.go": "biwako.goのイベントに関するご相談",
        "kyoto.go": "kyoto.goのイベントに関するご相談",
        "開発委託/相談": "プロダクトやシステム開発に関するご依頼やご相談",
        "出張撮影依頼": "出張撮影依頼",
        "RCC": "立命館コンピュータクラブに関するご相談(RCC)",
        "RM2C": "研究に関するお問い合わせ(RM2C)",
        "その他": "その他ご相談",
      },
      en: {
        "TechSelect+": "TechSelect+ consultation",
        "STECH": "STECH student engineer community",
        "JINEN": "Community management & student engineer events (JINEN)",
        "NxTEND_Event": "NxTEND events & community",
        "NxTEND_Organize": "NxTEND management participation",
        "biwako.go": "biwako.go events",
        "kyoto.go": "kyoto.go events",
        "開発委託/相談": "Product/system development consulting",
        "出張撮影依頼": "On-location photography",
        "RCC": "Ritsumeikan Computer Club (RCC)",
        "RM2C": "Research inquiries (RM2C)",
        "その他": "Other consultations",
      },
    } as Record<string, Record<string, string>>,
    contactLabels: {
      ja: {
        "taramanji": "本ページに関するお問い合わせ",
        "Ask Me": "面談予約の変更・取消について",
        "TechSelect+": "TechSelect+について",
        "STECH": "学生エンジニアコミュニティSTECHについてのお問い合わせ",
        "JINEN": "コミュニティ運営全般や学生エンジニア向けイベントについてのお問い合わせ(JINEN)",
        "NxTEND_Event": "NxTEND主催のイベントやコミュニティについてのお問い合わせ",
        "NxTEND_Organize": "NxTEND運営参加についてのお問い合わせ",
        "biwako.go": "biwako.goのイベントについてのお問い合わせ",
        "kyoto.go": "kyoto.goのイベントについてのお問い合わせ",
        "開発委託/相談": "プロダクトやシステム開発に関するご依頼やご相談",
        "出張撮影/写真相談": "出張撮影などカメラ・写真全般に関するご相談",
        "RCC": "立命館コンピュータクラブに関するお問い合わせ(RCC)",
        "RM2C": "研究に関するお問い合わせ(RM2C)",
        "その他": "その他お問い合わせ",
      },
      en: {
        "taramanji": "About this website",
        "Ask Me": "Change/cancel meeting reservation",
        "TechSelect+": "About TechSelect+",
        "STECH": "About STECH student engineer community",
        "JINEN": "Community management & student events (JINEN)",
        "NxTEND_Event": "About NxTEND events & community",
        "NxTEND_Organize": "About NxTEND management participation",
        "biwako.go": "About biwako.go events",
        "kyoto.go": "About kyoto.go events",
        "開発委託/相談": "Product/system development consulting",
        "出張撮影/写真相談": "Photography & camera inquiries",
        "RCC": "About Ritsumeikan Computer Club (RCC)",
        "RM2C": "Research inquiries (RM2C)",
        "その他": "Other inquiries",
      },
    } as Record<string, Record<string, string>>,
  },

  // ========== Events ==========
  events: {
    loading: {
      ja: "イベント取得中...",
      en: "Loading events...",
    },
    noEvents: {
      ja: "直近の主催イベントはありません",
      en: "No upcoming organized events",
    },
    participants: {
      ja: "参加者",
      en: "Participants",
    },
    waitlist: {
      ja: "補欠",
      en: "Waitlist",
    },
    viewDetails: {
      ja: "詳細を見る",
      en: "View Details",
    },
  },

  // ========== Articles ==========
  articles: {
    loading: {
      ja: "記事を取得中...",
      en: "Loading articles...",
    },
    noArticles: {
      ja: "記事がまだありません",
      en: "No articles yet",
    },
    readArticle: {
      ja: "記事を読む",
      en: "Read Article",
    },
    viewAll: {
      ja: "すべての記事を見る",
      en: "View All Articles",
    },
  },

  // ========== Affiliations ==========
  affiliations: {
    visitSite: {
      ja: "公式サイトを見る",
      en: "Visit Official Site",
    },
  },

  // ========== Reserve page ==========
  reserve: {
    title: {
      ja: "お打ち合わせ予約",
      en: "Meeting Reservation",
    },
    contactNote: {
      ja: (contactUrl: string, xUrl: string) =>
        `お問い合わせは<a class="underline" href="${contactUrl}">Contact</a>ページ・X(<a class="underline" href="${xUrl}" target="_blank" rel="noreferrer">@JavaLangRuntime</a>)でも承っております`,
      en: (contactUrl: string, xUrl: string) =>
        `Inquiries also welcome via <a class="underline" href="${contactUrl}">Contact</a> page or X (<a class="underline" href="${xUrl}" target="_blank" rel="noreferrer">@JavaLangRuntime</a>)`,
    },
    decide: {
      ja: "決定",
      en: "Confirm",
    },
    cancel: {
      ja: "予定を取り消す",
      en: "Cancel Reservation",
    },
    offlineNote: {
      ja: "で勤務予定地をご確認ください。",
      en: " to check planned work locations.",
    },
    offlineLabel: {
      ja: "勤務場所ページ",
      en: "Work Location page",
    },
    offlinePreamble: {
      ja: "対面でのご相談をご希望の方は",
      en: "For in-person meetings, visit the",
    },
    slotLabel: {
      ja: "直近相談予約可能時間(30分枠):",
      en: "Next available slot (30min):",
    },
    slotLoading: {
      ja: "読み込み中...",
      en: "Loading...",
    },
    quickApply: {
      ja: "最短での時間指定(30分枠)",
      en: "Quick book (30min slot)",
    },
    consultContent: {
      ja: "ご相談内容",
      en: "Consultation Type",
    },
    selectPurpose: {
      ja: "---選択してください---",
      en: "---Please select---",
    },
    yourName: {
      ja: "お名前",
      en: "Your Name",
    },
    namePlaceholder: {
      ja: "お名前(本名)",
      en: "Your name (real name)",
    },
    emailLabel: {
      ja: "メールアドレス",
      en: "Email Address",
    },
    emailNote: {
      ja: "入力いただいたメールアドレスに Google カレンダーから招待が届きます。お手数ですが必ずご確認ください。\nこちらの都合で予定のキャンセルや変更のお願いを差し上げる場合も、上記のメールアドレス宛にご連絡いたします。",
      en: "A Google Calendar invitation will be sent to your email. Please check it.\nWe will also contact this email for any schedule changes or cancellations.",
    },
    slotSet: {
      ja: (text: string) => `予約日時を ${text} にセットしました`,
      en: (text: string) => `Reservation set to ${text}`,
    },
    selectDateTime: {
      ja: "日付と時間を選択してください",
      en: "Please select date and time",
    },
    checkInput: {
      ja: "入力内容をご確認ください",
      en: "Please check your input",
    },
    invalidTime: {
      ja: "ご指定の時間では予約できません",
      en: "Cannot reserve at the specified time",
    },
    endAfterStart: {
      ja: "終了は開始より後にしてください",
      en: "End time must be after start time",
    },
    pastError: {
      ja: "過去の時間は選択できません",
      en: "Cannot select past times",
    },
    leadTimeError: {
      ja: "現在時刻から2時間後以降のみ予約できます",
      en: "Reservations must be at least 2 hours from now",
    },
    raceCondition: {
      ja: "直前に同時間帯の予約が入りました。別の時間をお選びください",
      en: "This time slot was just booked. Please select another time",
    },
    busySlot: {
      ja: "選択した時間帯は不可です",
      en: "Selected time slot is unavailable",
    },
  },

  // ========== Loading ==========
  loading: {
    fetching: {
      ja: "取得中…",
      en: "Loading…",
    },
  },
} as const;
