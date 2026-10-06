import { useEffect, useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { BLOG_PER_PAGE, fetchBlogPage, fetchCheatSheetArticles } from "@/entities/article";
import { CHEAT_SHEET_SERIES } from "@/features/blog-series";
import { selectArticles, type LoadedPages } from "./select";
import { currentPageAtom, prefetchUpToAtom, searchTextAtom, selectedSeriesAtom } from "./state";

// 旧実装はページと OGP を localStorage に 1 日保存していた。ここでは同じ期間をメモリ上のキャッシュで持つ
const DAY = 24 * 60 * 60 * 1000;
const PREFETCH_DELAY_MS = 1000;

export function useBlogArticles() {
  const [search, setSearch] = useAtom(searchTextAtom);
  const [series, setSeries] = useAtom(selectedSeriesAtom);
  const [currentPage, setCurrentPage] = useAtom(currentPageAtom);
  const [prefetchUpTo, setPrefetchUpTo] = useAtom(prefetchUpToAtom);
  const perPage = BLOG_PER_PAGE;

  // 1 ページ目から「今のページ」か「裏で取りに行くページ」までを取得する（検索・シリーズの絞り込みは取得済みの全記事が対象）
  const lastPage = Math.max(currentPage, prefetchUpTo);
  const pageNumbers = useMemo(() => Array.from({ length: lastPage }, (_, i) => i + 1), [lastPage]);
  const pageQueries = useQueries({
    queries: pageNumbers.map((page) => ({
      queryKey: ["blogs", "page", page, perPage],
      queryFn: () => fetchBlogPage(page, perPage),
      staleTime: DAY,
      gcTime: DAY,
    })),
  });

  const pages: LoadedPages = useMemo(() => {
    const m: LoadedPages = new Map();
    pageQueries.forEach((q, i) => {
      if (q.data) m.set(pageNumbers[i], q.data);
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageQueries.map((q) => q.dataUpdatedAt).join(","), pageNumbers]);

  // 6 件取れたページの次を、1 秒おいて裏で取りに行く（記事がなくなるまで）
  const lastLoaded = pages.get(prefetchUpTo);
  useEffect(() => {
    const base = Math.max(prefetchUpTo, currentPage);
    const loaded = pages.get(base);
    if (!loaded || loaded.length < perPage) return;
    const t = setTimeout(() => setPrefetchUpTo(base + 1), PREFETCH_DELAY_MS);
    return () => clearTimeout(t);
  }, [lastLoaded, pages, prefetchUpTo, currentPage, perPage, setPrefetchUpTo]);

  const cheat = useQuery({
    queryKey: ["blogs", "cheat-sheet"],
    queryFn: fetchCheatSheetArticles,
    enabled: series === CHEAT_SHEET_SERIES,
    staleTime: DAY,
  });

  const view = selectArticles({ pages, cheatSheet: cheat.data ?? [], series, search, currentPage, perPage });

  const currentIndex = currentPage - 1;
  const pageLoading = !series && !search.trim() && (pageQueries[currentIndex]?.isPending ?? true);
  const backgroundFetching = pageQueries.some((q, i) => i !== currentIndex && q.isFetching);

  // 絞り込みを変えたら 1 ページ目へ
  useEffect(() => {
    setCurrentPage(1);
  }, [series, search, setCurrentPage]);

  // ページを超えていたら最後のページへ。開いたページに記事がなければ 1 つ戻す
  useEffect(() => {
    if (view.totalPages > 0 && currentPage > view.totalPages && !pageLoading) setCurrentPage(view.totalPages);
  }, [currentPage, view.totalPages, pageLoading, setCurrentPage]);
  useEffect(() => {
    if (!series && !search.trim() && !pageLoading && view.items.length === 0 && currentPage > 1) setCurrentPage(currentPage - 1);
  }, [series, search, pageLoading, view.items.length, currentPage, setCurrentPage]);

  return {
    search,
    setSearch,
    series,
    selectSeries: setSeries,
    clearSeries: () => setSeries(""),
    currentPage,
    prev: () => setCurrentPage(Math.max(1, currentPage - 1)),
    next: () => {
      if (!view.nextDisabled) setCurrentPage(currentPage + 1);
    },
    view,
    pageLoading,
    cheatLoading: series === CHEAT_SHEET_SERIES && cheat.isPending,
    backgroundFetching,
  };
}
