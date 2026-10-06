import { RiBuilding2Line } from "@remixicon/react";
import { linkCards } from "@/entities/link";
import { LinkCardsGrid } from "@/widgets/link-cards";
import { PageContainer, PageHeader } from "@/shared/ui/layout";

export default function LinksPage() {
  return (
    <PageContainer>
      <PageHeader title="リンク集" />
      <LinkCardsGrid cards={linkCards} />
      <p className="mt-10 text-center text-body-2-regular text-text-tertiary">
        ※ 所属組織の公式サイトへのリンクは、トップページの「<RiBuilding2Line className="inline size-4 align-[-0.15em]" aria-label="🏢" /> Affiliation」セクションにある各タグをクリックすると表示されます。
      </p>
    </PageContainer>
  );
}
