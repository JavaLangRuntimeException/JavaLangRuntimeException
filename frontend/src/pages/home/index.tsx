import { AffiliationBadges } from "@/widgets/affiliations";
import { ConnpassEventCards } from "@/widgets/connpass-events";
import { NavCards } from "@/widgets/nav-cards";
import { OrcidWorks } from "@/widgets/orcid-works";
import { ProfileHero } from "@/widgets/profile";
import { PublishedArticles } from "@/widgets/published-articles";
import { SkillBadges } from "@/widgets/skills";
import { PageContainer } from "@/shared/ui/layout";
import { useT } from "@/shared/lib/i18n";

export default function HomePage() {
  const t = useT();
  return (
    <PageContainer className="flex flex-col gap-4">
      <ProfileHero />
      <div>
        <NavCards
          items={[
            { href: "/link", title: "Links", description: t({ ja: <>プロフィール・SNSのリンク一覧</>, en: <>Profile and social links</> }) },
            { href: "/location", title: "Work Spot", description: t({ ja: <>勤務場所の予定<br />今日以降の勤務予定地を確認</>, en: <>Work schedule<br />See where I will be working</> }) },
            { href: "/contact", title: "Contact", description: t({ ja: <>お問い合わせフォーム<br />ご質問・ご相談はこちらから</>, en: <>Contact form<br />Send questions or requests here</> }) },
            { href: "/reserve", title: "Ask Me", description: t({ ja: <>ご相談・面談予約ページ<br />ご希望の日時を選択してください</>, en: <>Book a meeting<br />Pick a date and time that suits you</> }) },
          ]}
        />
      </div>
      <div className="mt-4 flex flex-col">
        <AffiliationBadges />
        <SkillBadges />
        <ConnpassEventCards />
        <OrcidWorks />
        <PublishedArticles />
      </div>
    </PageContainer>
  );
}
