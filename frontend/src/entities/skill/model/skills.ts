import type { L10n } from "@/shared/lib/i18n";

export type Skill = {
    title: string;
    /** 英語のままの語は文字列のまま */
    short: string | L10n;
    description: L10n;
    color: string;
    /** 押すと Google 検索する語。言語で変わるものだけ L10n */
    tags: string[] | L10n<string[]>;
};

export const skills: Skill[] = [
    {
        title: "Software Backend / API",
        short: "Golang, Python, Ruby, TypeScript, Domain Driven Design, Clean Architecture, REST/gRPC",
        description: {
            ja: "Go・Python・Ruby・TypeScriptによるAPI/Batch開発。Clean Architecture、REST/gRPC/WebSocket、エラーハンドリング設計、ログ/メトリクス/トレース対応。",
            en: "API and batch development in Go, Python, Ruby, and TypeScript. Clean Architecture, REST/gRPC/WebSocket, error-handling design, and logging/metrics/tracing.",
        },
        color: "bg-cyan-700",
        tags: ["Golang", "Echo", "Python", "Flask", "FastAPI", "Django", "Ruby", "Rails", "TypeScript", "Hono.js", "Google Apps Script", "gRPC", "WebSocket", "Clean Architecture", "OpenTelemetry", "DDD"],
    },
    {
        title: "Frontend / Web",
        short: "Next.js/React, Nuxt.js/Vue.js, TypeScript, BFF",
        description: {
            ja: "Next.js, Nuxt.jsでのアクセシビリティ配慮のUI実装。TypeScriptでのBFF/型安全(Zod)を活用。画像最適化・コード分割・メモ化等でパフォーマンスを向上。",
            en: "Accessible UI implementation with Next.js and Nuxt.js. BFFs and type safety (Zod) in TypeScript. Performance improvements through image optimization, code splitting, memoization, and more.",
        },
        color: "bg-sky-700",
        tags: [
            "Next.js",
            "React",
            "Nuxt.js",
            "Vue.js",
            "TypeScript",
            "BFF",
            "Zod",
            "Tailwind CSS",
        ],
    },

    {
        title: "Android / Native",
        short: "Kotlin, Java,Jetpack Compose, Android SDK",
        description: {
            ja: "Kotlin/JavaでのAndroidネイティブ開発。Jetpack Compose/Material3、コルーチン、Clean Architecture設計、DI(Hilt)、データ永続化(Room)、ネットワーク(Retrofit/OkHttp)。",
            en: "Native Android development in Kotlin/Java. Jetpack Compose/Material3, coroutines, Clean Architecture, DI (Hilt), persistence (Room), and networking (Retrofit/OkHttp).",
        },
        color: "bg-green-700",
        tags: ["Kotlin", "Java", "Jetpack Compose", "Android SDK", "Material3", "Coroutines", "Hilt", "Room", "Retrofit", "OkHttp"],
    },

    {
        title: "XR(MR/AR/VR) / 3D",
        short: "Unity, WebXR, Three.js",
        description: {
            ja: "Unity、WebXR/Three.jsでのXR/3Dアプリ開発。",
            en: "XR/3D app development with Unity and WebXR/Three.js.",
        },
        color: "bg-violet-700",
        tags: ["Unity", "C#", "WebXR", "Three.js", "AR", "VR", "MR"],
    },
    {
        title: "Infrastructure / Public Cloud",
        short: "Amazon Web Services / Google Cloud, IaC",
        description: {
            ja: "AWS/Google Cloud、TerraformでのIaC、水平スケール設計、監視基盤構築。",
            en: "AWS/Google Cloud, IaC with Terraform, horizontally scalable design, and monitoring infrastructure.",
        },
        color: "bg-amber-700",
        tags: ["AWS", "Google Cloud", "Terraform", "Cloud Run", "GKE", "ECS", "Fargate", "Lambda", "Cloudflare", "Vercel", "Firebase", "Supabase"],
    },
    {
        title: "Infrastructure / DevOps / SRE",
        short: "Docker, Kubernetes, CI/CD, GitHub Actions",
        description: {
            ja: "Docker/Kubernetesでのインフラ構築、GitHub ActionsでのCI/CD、信頼性・回復性を高める運用。",
            en: "Infrastructure with Docker/Kubernetes, CI/CD with GitHub Actions, and operations that improve reliability and resilience.",
        },
        color: "bg-lime-700",
        tags: ["Docker", "Kubernetes", "GitHub Actions", "SLO/SLA", "Retry/Backoff"],
    },
    {
        title: "Database / Cache",
        short: "RDB(PostgreSQL, MySQL), Cache(Redis), NoSQL(MongoDB, DynamoDB, bigTable)",
        description: {
            ja: "RDB設計/最適化、インデックスチューニング、Redisによるキャッシュ/レート制限設計。 NoSQL(MongoDB, DynamoDB, bigTable)によるスケーラビリティの向上。",
            en: "Relational database design and optimization, index tuning, and caching/rate limiting with Redis. Better scalability with NoSQL (MongoDB, DynamoDB, Bigtable).",
        },
        color: "bg-rose-700",
        tags: ["PostgreSQL", "MySQL", "Redis", "MongoDB", "DynamoDB", "bigTable", "Index", "Query Plan"],
    },
    {
        title: "ChatOps / Bot Development",
        short: "Discord Bot, Slack Bot, Webhook",
        description: {
            ja: "Discord/Slack向けBotの設計・実装。discord.py、OAuth2、Webhook、スラッシュコマンド、スケジューラ。",
            en: "Designing and building bots for Discord/Slack. discord.py, OAuth2, webhooks, slash commands, and schedulers.",
        },
        color: "bg-fuchsia-700",
        tags: [
            "Slack Bolt",
            "Slack API",
            "discord.py",
            "Slash Commands",
            "Webhook",
            "OAuth2",
            "Scheduling",
        ],
    },
    {
        title: "Project Management",
        short: "Scope, Schedule, Risk, Stakeholders",
        description: {
            ja: "プロジェクト計画〜実行管理。WBS/スケジュール、要件定義、リスク・品質・コスト管理。",
            en: "From project planning to execution: WBS/scheduling, requirements definition, and risk, quality, and cost management.",
        },
        color: "bg-teal-700",
        tags: ["WBS", "Requirement", "Risk", "Quality", "Cost", "Schedule", "Stakeholder", "Scrum", "Kanban"],
    },
    {
        title: "Community Management",
        short: "Facilitation, Community Management, Event Ops",
        description: {
            ja: "コミュニティの設計・運営、技術イベント企画/当日運営、情報設計、合意形成/ファシリテーション、スポンサー/登壇者調整。",
            en: "Designing and running communities, planning and running tech events, information design, consensus building and facilitation, and coordinating sponsors and speakers.",
        },
        color: "bg-indigo-700",
        tags: ["Facilitation", "Community", "Event", "Operations", "Moderator", "Sponsorship"],
    },
    {
        title: "Technical Mentoring",
        short: "Mentoring, Code Review, Workshop",
        description: {
            ja: "学生エンジニア向けの技術メンタリング。学習設計、コードレビュー、設計レビュー、キャリア相談",
            en: "Technical mentoring for student engineers: learning plans, code reviews, design reviews, and career advice.",
        },
        color: "bg-emerald-700",
        tags: ["Mentoring", "Code Review", "Design Review", "Workshop", "Career"],
    },
    {
        title: "Photography",
        short: { ja: "出張撮影、ポートレート、イベント撮影", en: "On-location shoots, portraits, event photography" },
        description: {
            ja: "フリーランスカメラマンとして出張撮影を承ります。ポートレート、イベント撮影、など幅広く対応可能です。",
            en: "Available as a freelance photographer for on-location shoots, including portraits and event photography.",
        },
        color: "bg-pink-700",
        tags: {
            ja: ["出張撮影", "ポートレート", "イベント撮影", "写真編集", "Lightroom Classic"],
            en: ["On-location photography", "Portrait", "Event photography", "Photo editing", "Lightroom Classic"],
        },
    },
    {
        title: "Certification",
        short: { ja: "取得した資格", en: "Certifications I hold" },
        description: {
            ja: "ITパスポート/情報セキュリティマネジメント試験/基本情報技術者試験/応用情報技術者試験",
            en: "IT Passport / Information Security Management / Fundamental Information Technology Engineer / Applied Information Technology Engineer Examinations",
        },
        color: "bg-stone-700",
        tags: {
            ja: ["ITパスポート", "情報セキュリティマネジメント", "基本情報技術者", "応用情報技術者"],
            en: ["IT Passport", "Information Security Management", "Fundamental Information Technology Engineer", "Applied Information Technology Engineer"],
        },
    },
];
