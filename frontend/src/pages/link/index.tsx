import { linkCards } from "@/entities/link";
import { LinkCardsGrid } from "@/widgets/link-cards";
import { PageContainer, PageHeader } from "@/shared/ui/layout";
import { useT } from "@/shared/lib/i18n";

export default function LinksPage() {
  const t = useT();
  return (
    <PageContainer>
      <PageHeader title={t({ ja: "リンク集", en: "Links" })} />
      <LinkCardsGrid cards={linkCards} />
      <p className="mt-10 text-center text-body-2-regular text-text-tertiary">
        {t({
          ja: "※ 所属組織の公式サイトへのリンクは、トップページの「Affiliation」セクションにある各タグをクリックすると表示されます。",
          en: "* Links to the official sites of my affiliations appear when you click each tag in the “Affiliation” section on the home page.",
        })}
      </p>
    </PageContainer>
  );
}
