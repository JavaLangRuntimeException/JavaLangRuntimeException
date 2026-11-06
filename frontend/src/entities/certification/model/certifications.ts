import type { L10n } from "@/shared/lib/i18n";

/** Credly のプロフィール（取得したバッジの一覧） */
export const CREDLY_PROFILE_URL = "https://www.credly.com/users/javalangruntimeexception";

export type Certification = {
  name: L10n;
  issuer: L10n;
  description: L10n;
  /** 資格そのものを説明する公式ページ */
  href: string;
  /** 左の帯の色（スキルと同じく識別色） */
  color: string;
  /** 合格・取得した日（受験日）。出さないものは省く */
  achieved?: L10n;
};

export const certifications: Certification[] = [
  {
    name: { ja: "AWS 認定ソリューションアーキテクト – アソシエイト", en: "AWS Certified Solutions Architect – Associate" },
    issuer: { ja: "Amazon Web Services", en: "Amazon Web Services" },
    description: {
      ja: "AWS 上で、可用性・性能・コスト・セキュリティを満たすシステムを設計できることを認定する資格。",
      en: "Validates the ability to design available, high-performing, cost-efficient, and secure systems on AWS.",
    },
    href: "https://aws.amazon.com/certification/certified-solutions-architect-associate/",
    achieved: { ja: "2026年11月6日 取得", en: "Earned Nov 6, 2026" },
    color: "bg-amber-700",
  },
  {
    name: { ja: "応用情報技術者試験(AP)", en: "Applied Information Technology Engineer Examination (AP)" },
    issuer: { ja: "IPA（情報処理推進機構）", en: "IPA (Information-technology Promotion Agency, Japan)" },
    description: {
      ja: "高度 IT 人材となるために必要な応用的知識・技能を持ち、技術から管理・経営まで幅広く理解していることを認定する国家試験。",
      en: "A national exam certifying the applied knowledge and skills needed to become an advanced IT professional, from technology to management and strategy.",
    },
    href: "https://www.ipa.go.jp/shiken/kubun/ap.html",
    achieved: { ja: "2024年10月13日（日）受験 合格", en: "Passed (exam taken Sun, Oct 13, 2024)" },
    color: "bg-rose-700",
  },
  {
    name: { ja: "基本情報技術者試験(FE)", en: "Fundamental Information Technology Engineer Examination (FE)" },
    issuer: { ja: "IPA（情報処理推進機構）", en: "IPA (Information-technology Promotion Agency, Japan)" },
    description: {
      ja: "IT エンジニアとして必要な基本的知識・技能を持ち、実践的な活用能力を身に付けていることを認定する国家試験。",
      en: "A national exam certifying the fundamental knowledge and skills of an IT engineer and the ability to apply them in practice.",
    },
    href: "https://www.ipa.go.jp/shiken/kubun/fe.html",
    achieved: { ja: "2024年2月20日（火）受験 合格", en: "Passed (exam taken Tue, Feb 20, 2024)" },
    color: "bg-sky-700",
  },
  {
    name: { ja: "情報セキュリティマネジメント試験(SG)", en: "Information Security Management Examination (SG)" },
    issuer: { ja: "IPA（情報処理推進機構）", en: "IPA (Information-technology Promotion Agency, Japan)" },
    description: {
      ja: "組織の情報セキュリティを確保し、脅威から継続的に組織を守るための基本的なスキルを認定する国家試験。",
      en: "A national exam certifying the basic skills to secure an organization's information and continuously protect it from threats.",
    },
    href: "https://www.ipa.go.jp/shiken/kubun/sg.html",
    achieved: { ja: "2023年11月12日（日）受験 合格", en: "Passed (exam taken Sun, Nov 12, 2023)" },
    color: "bg-green-700",
  },
  {
    name: { ja: "ITパスポート試験", en: "Information Technology Passport Examination" },
    issuer: { ja: "IPA（情報処理推進機構）", en: "IPA (Information-technology Promotion Agency, Japan)" },
    description: {
      ja: "IT を利用するすべての社会人・学生が備えておくべき、IT に関する基礎的な知識を証明する国家試験。",
      en: "A national exam proving the basic IT knowledge that every working person and student who uses IT should have.",
    },
    href: "https://www.ipa.go.jp/shiken/kubun/ip.html",
    color: "bg-stone-700",
  },
];
