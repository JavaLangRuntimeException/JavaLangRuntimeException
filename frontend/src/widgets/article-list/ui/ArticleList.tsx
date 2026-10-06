import { BlogArticleCard } from "@/entities/article";
import { PrevNextPagination } from "@/features/blog-pagination";
import { SearchInput } from "@/features/blog-search";
import { CHEAT_SHEET_SERIES, SERIES_LIST, SeriesButtons } from "@/features/blog-series";
import { Skeleton } from "@/shared/ui/layout";
import { cx } from "@/utils/cx";
import { useBlogArticles } from "../model/use-blog-articles";
import { visibleArticles } from "../model/select";

function Status({ children, pulse }: { children: string; pulse?: boolean }) {
  return (
    <p role="status" className="flex items-center justify-center gap-2 py-6 text-body-2-regular text-text-tertiary">
      <span aria-hidden="true" className={cx("size-2 rounded-full bg-accent-500", pulse && "animate-pulse motion-reduce:animate-none")} />
      {children}
    </p>
  );
}

/** Qiita の記事一覧（検索・シリーズ・ページ送り） */
export function ArticleList() {
  const s = useBlogArticles();
  const articles = visibleArticles(s.view.items);
  const isCheatSheet = s.series === CHEAT_SHEET_SERIES;
  const showPagination = s.view.paginated && !s.search.trim() && !s.pageLoading && !s.cheatLoading && s.view.items.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <SearchInput value={s.search} onChange={s.setSearch} />
        <SeriesButtons seriesList={SERIES_LIST} selectedSeries={s.series} onSelect={s.selectSeries} onClear={s.clearSeries} />
      </div>

      {showPagination && (
        <PrevNextPagination currentPage={s.currentPage} totalPages={s.view.totalPages} onPrev={s.prev} onNext={s.next} isNextDisabled={s.view.nextDisabled} />
      )}

      {s.pageLoading && (
        <>
          <Status pulse>記事取得中...</Status>
          <div className="grid gap-5 lg:grid-cols-2" aria-hidden="true">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-80 rounded-3xl" />
            ))}
          </div>
        </>
      )}

      {articles.length > 0 && (
        <div className={cx("grid gap-5", isCheatSheet ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2")}>
          {articles.map((a) => (
            <BlogArticleCard key={a.url} title={a.title} description={a.description} url={a.url} image={a.images?.[0]} tags={a.tags} />
          ))}
        </div>
      )}

      {s.cheatLoading && <Status pulse>記事を読み込み中...</Status>}
      {s.backgroundFetching && <Status pulse>バックグラウンドで記事を取得中...</Status>}
    </div>
  );
}
