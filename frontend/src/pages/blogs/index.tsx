import { Link } from "react-router";
import { ArticleList } from "@/widgets/article-list";
import { PageContainer, PageHeader } from "@/shared/ui/layout";

const linkClass =
  "inline-flex h-9 items-center gap-1.5 rounded-2lg border border-border-button-default bg-background-primary-default px-3 text-body-medium text-text-primary shadow-xs press hover:border-border-button-hover hover:bg-background-primary-hover outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring";

export default function BlogsPage() {
  return (
    <PageContainer width="wide">
      <PageHeader
        title="Published Articles"
        actions={
          <>
            <Link to="/link" className={linkClass}>
              <span>←</span>
              <span>リンク集に戻る</span>
            </Link>
            <a href="https://qiita.com/JavaLangRuntimeException" target="_blank" rel="noopener noreferrer" className={linkClass}>
              <span>Qiitaプロフィールへ</span>
              <span>→</span>
            </a>
          </>
        }
      />
      <ArticleList />
    </PageContainer>
  );
}
