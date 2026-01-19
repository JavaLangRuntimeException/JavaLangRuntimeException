export type Skill = {
    title: string;
    short: string;
    description: string;
    color: string;
    tags: string[];
};

export const skills: Skill[] = [
    {
        title: "Software Backend / API",
        short: "Golang, Python, Ruby, TypeScript, Domain Driven Design, Clean Architecture, REST/gRPC",
        description:
            "Go・Python・Ruby・TypeScriptによるAPI/Batch開発。Clean Architecture、REST/gRPC/WebSocket、エラーハンドリング設計、ログ/メトリクス/トレース対応。",
        color: "bg-cyan-700",
        tags: ["Golang", "Echo", "Python", "Flask", "FastAPI", "Django", "Ruby", "Rails", "TypeScript", "Hono.js", "Google Apps Script", "gRPC", "WebSocket", "Clean Architecture", "OpenTelemetry", "DDD"],
    },
    {
        title: "Frontend / Web",
        short: "Next.js/React, Nuxt.js/Vue.js, TypeScript, BFF",
        description:
            "Next.js, Nuxt.jsでのアクセシビリティ配慮のUI実装。TypeScriptでのBFF/型安全(Zod)を活用。画像最適化・コード分割・メモ化等でパフォーマンスを向上。",
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
        description:
            "Kotlin/JavaでのAndroidネイティブ開発。Jetpack Compose/Material3、コルーチン、Clean Architecture設計、DI(Hilt)、データ永続化(Room)、ネットワーク(Retrofit/OkHttp)。",
        color: "bg-green-700",
        tags: ["Kotlin", "Java", "Jetpack Compose", "Android SDK", "Material3", "Coroutines", "Hilt", "Room", "Retrofit", "OkHttp"],
    },

    {
        title: "XR(MR/AR/VR) / 3D",
        short: "Unity, WebXR, Three.js",
        description:
            "Unity、WebXR/Three.jsでのXR/3Dアプリ開発。",
        color: "bg-violet-700",
        tags: ["Unity", "C#", "WebXR", "Three.js", "AR", "VR", "MR"],
    },
    {
        title: "Infrastructure / Public Cloud",
        short: "Amazon Web Services / Google Cloud, IaC",
        description:
            "AWS/Google Cloud、TerraformでのIaC、水平スケール設計、監視基盤構築。",
        color: "bg-amber-700",
        tags: ["AWS", "Google Cloud", "Terraform", "Cloud Run", "GKE", "ECS", "Fargate", "Lambda", "Cloudflare", "Vercel", "Firebase", "Supabase"],
    },
    {
        title: "Infrastructure / DevOps ・ SRE",
        short: "Docker, Kubernetes, CI/CD, GitHub Actions",
        description:
            "Docker/Kubernetesでのインフラ構築、GitHub ActionsでのCI/CD、信頼性・回復性を高める運用。",
        color: "bg-lime-700",
        tags: ["Docker", "Kubernetes", "GitHub Actions", "SLO/SLA", "Retry/Backoff"],
    },
    {
        title: "Database / Cache",
        short: "RDB(PostgreSQL, MySQL), Cache(Redis), NoSQL(MongoDB, DynamoDB, bigTable)",
        description:
            "RDB設計/最適化、インデックスチューニング、Redisによるキャッシュ/レート制限設計。 NoSQL(MongoDB, DynamoDB, bigTable)によるスケーラビリティの向上。",
        color: "bg-rose-700",
        tags: ["PostgreSQL", "MySQL", "Redis", "MongoDB", "DynamoDB", "bigTable", "Index", "Query Plan"],
    },
    {
        title: "ChatOps / Bot Development",
        short: "Discord Bot, Slack Bot, Webhook",
        description:
            "Discord/Slack向けBotの設計・実装。discord.py、OAuth2、Webhook、スラッシュコマンド、スケジューラ。",
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
        description:
            "プロジェクト計画〜実行管理。WBS/スケジュール、要件定義、リスク・品質・コスト管理。",
        color: "bg-teal-700",
        tags: ["WBS", "Requirement", "Risk", "Quality", "Cost", "Schedule", "Stakeholder", "Scrum", "Kanban"],
    },
    {
        title: "Community Management",
        short: "Facilitation, Community Management, Event Ops",
        description:
            "コミュニティの設計・運営、技術イベント企画/当日運営、情報設計、合意形成/ファシリテーション、スポンサー/登壇者調整。",
        color: "bg-indigo-700",
        tags: ["Facilitation", "Community", "Event", "Operations", "Moderator", "Sponsorship"],
    },
    {
        title: "Technical Mentoring",
        short: "Mentoring, Code Review, Workshop",
        description:
            "学生エンジニア向けの技術メンタリング。学習設計、コードレビュー、設計レビュー、キャリア相談",
        color: "bg-emerald-700",
        tags: ["Mentoring", "Code Review", "Design Review", "Workshop", "Career"],
    },
    {
        title: "Photography",
        short: "出張撮影、ポートレート、イベント撮影",
        description:
            "フリーランスカメラマンとして出張撮影を承ります。ポートレート、イベント撮影、など幅広く対応可能です。",
        color: "bg-pink-700",
        tags: [
            "出張撮影",
            "ポートレート",
            "イベント撮影",
            "写真編集",
            "Lightroom Classic",
        ],
    },
    {
        title: "Certification",
        short: "取得した資格",
        description:
            "ITパスポート/情報セキュリティマネジメント試験/基本情報技術者試験/応用情報技術者試験",
        color: "bg-stone-700",
        tags: [
            "ITパスポート",
            "情報セキュリティマネジメント",
            "基本情報技術者",
            "応用情報技術者",
        ],
    },
];
