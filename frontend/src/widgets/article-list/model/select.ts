import type { ArticleOgp } from "@/entities/article";
import { CHEAT_SHEET_SERIES, getSeriesFilterKeyword } from "@/features/blog-series";

/** 取得済みのページ（ページ番号 → 記事）。未取得のページは入れない */
export type LoadedPages = Map<number, ArticleOgp[]>;

/** 取得済みの全記事（ページ順・URL で重複を除く） */
export function allArticles(pages: LoadedPages): ArticleOgp[] {
  const seen = new Set<string>();
  const out: ArticleOgp[] = [];
  for (const page of [...pages.keys()].sort((a, b) => a - b)) {
    for (const a of pages.get(page) ?? []) {
      if (!seen.has(a.url)) {
        seen.add(a.url);
        out.push(a);
      }
    }
  }
  return out;
}

const matchesSearch = (search: string) => {
  const key = search.toLowerCase();
  return (a: ArticleOgp) => (a.title || "").toLowerCase().includes(key);
};

export type ArticleView = {
  items: ArticleOgp[];
  totalPages: number;
  /** ページ送りを出すか（検索中・チートシートは全件表示なので出さない） */
  paginated: boolean;
  nextDisabled: boolean;
};

/**
 * 画面に出す記事（旧 blogs/page.tsx の filteredData / paginatedData / totalPages と同じ規則）
 *  - 検索中: 対象（シリーズ選択時はそのシリーズ）からタイトルで絞り、全件表示
 *  - チートシート: 全件表示
 *  - その他のシリーズ: 取得済みの全記事をタイトルで絞り、perPage 件ずつ
 *  - 未選択: そのページの記事
 */
export function selectArticles(args: {
  pages: LoadedPages;
  cheatSheet: ArticleOgp[];
  series: string;
  search: string;
  currentPage: number;
  perPage: number;
}): ArticleView {
  const { pages, cheatSheet, series, search, currentPage, perPage } = args;
  const searching = search.trim() !== "";
  const pool = () => {
    if (series === CHEAT_SHEET_SERIES) return cheatSheet;
    const all = allArticles(pages);
    if (!series) return all;
    const keyword = getSeriesFilterKeyword(series);
    return all.filter((a) => (a.title || "").includes(keyword));
  };

  if (searching) {
    return { items: pool().filter(matchesSearch(search)), totalPages: 1, paginated: false, nextDisabled: true };
  }
  if (series === CHEAT_SHEET_SERIES) {
    return { items: cheatSheet, totalPages: 1, paginated: false, nextDisabled: true };
  }
  if (series) {
    const filtered = pool();
    const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
    const start = (currentPage - 1) * perPage;
    return { items: filtered.slice(start, start + perPage), totalPages, paginated: totalPages > 1, nextDisabled: currentPage >= totalPages };
  }

  // 未選択: 最後のページは「perPage 未満」か「0 件」で分かる。まだ分からなければ次のページがある前提で 1 つ先まで出す
  const items = pages.get(currentPage) ?? [];
  const loaded = [...pages.keys()].sort((a, b) => a - b);
  const lastWithItems = loaded.filter((p) => (pages.get(p)?.length ?? 0) > 0).reduce((m, p) => Math.max(m, p), 0);
  const endKnown = loaded.some((p) => (pages.get(p)?.length ?? 0) < perPage);
  const totalPages = Math.max(1, endKnown ? lastWithItems : Math.max(lastWithItems, currentPage) + (items.length > 0 ? 1 : 0));
  return { items, totalPages, paginated: items.length > 0, nextDisabled: currentPage >= totalPages };
}

/** 表示する記事: タイトルと URL があるものだけ、URL の重複は最初だけ */
export function visibleArticles(items: ArticleOgp[]): ArticleOgp[] {
  return items.filter((a, idx, arr) => a.title?.trim() && a.url?.trim() && arr.findIndex((b) => b.url === a.url) === idx);
}
