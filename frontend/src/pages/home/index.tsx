import { AffiliationBadges } from "@/widgets/affiliations";
import { ConnpassEventCards } from "@/widgets/connpass-events";
import { NavCards } from "@/widgets/nav-cards";
import { OrcidWorks } from "@/widgets/orcid-works";
import { ProfileHero } from "@/widgets/profile";
import { PublishedArticles } from "@/widgets/published-articles";
import { SkillBadges } from "@/widgets/skills";
import { PageContainer } from "@/shared/ui/layout";

export default function HomePage() {
  return (
    <PageContainer className="flex flex-col gap-4">
      <ProfileHero />
      <div>
        <NavCards
          items={[
            { href: "/link", title: "Links", description: <>プロフィール・SNSのリンク一覧</> },
            { href: "/location", title: "Work Spot", description: <>勤務場所の予定<br />今日以降の勤務予定地を確認</> },
            { href: "/contact", title: "Contact", description: <>お問い合わせフォーム<br />ご質問・ご相談はこちらから</> },
            { href: "/reserve", title: "Ask Me", description: <>ご相談・面談予約ページ<br />ご希望の日時を選択してください</> },
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
