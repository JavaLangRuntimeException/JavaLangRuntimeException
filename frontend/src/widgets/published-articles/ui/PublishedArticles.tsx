import { Link } from "react-router";
import type { ArticleOgp } from "@/entities/article";
import { ArticleListCard } from "@/entities/article";
import { Section, Skeleton } from "@/shared/ui/layout";
import { usePublishedArticles } from "../model/use-published-articles";

function Group({ title, articles }: { title: string; articles: ArticleOgp[] }) {
  if (articles.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      <h3 className="inline-flex items-center gap-2 text-body-semibold text-text-secondary">
        {title}
      </h3>
      <ul className="flex flex-col gap-3">
        {articles.map((a) => (
          <li key={a.url}>
            <ArticleListCard article={a} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Qiita の記事（ピックアップ・最新） */
export function PublishedArticles() {
  const { data, isPending } = usePublishedArticles();
  const empty = !data || (data.pickupArticles.length === 0 && data.latestArticlesFromScrape.length === 0 && data.latestArticles.length === 0);

  return (
    <Section
      id="articles"
      title="Published Articles"
    >
      {isPending && (
        <div className="flex flex-col gap-3" aria-busy="true">
          <p className="text-body-2-regular text-text-tertiary">記事を取得中...</p>
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      )}
      {!isPending && empty && <p className="text-body-2-regular text-text-tertiary">記事がまだありません</p>}
      {!isPending && data && !empty && (
        <div className="flex flex-col gap-8">
          <Group title="Pickup Articles" articles={data.pickupArticles} />
          <Group title="PickUp Articles" articles={data.latestArticlesFromScrape} />
          <Group title="Latest Articles" articles={data.latestArticles} />
        </div>
      )}
      {!isPending && (
        <div className="flex justify-center pt-2">
          <Link
            to="/blogs"
            className="inline-flex items-center gap-1 rounded-xl border border-border-button-default bg-background-primary-default px-4 py-2.5 text-body-medium text-text-primary shadow-xs outline-none press hover:border-border-button-hover hover:bg-background-primary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring"
          >
            すべての記事を見る
            </Link>
        </div>
      )}
    </Section>
  );
}
