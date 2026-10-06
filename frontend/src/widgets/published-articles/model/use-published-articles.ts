import { useQuery } from "@tanstack/react-query";
import { fetchQiitaProfile, type ArticleOgp } from "@/entities/article";
import { contentApi } from "@/shared/api/clients";

type Item = { url: string; title: string; tags: string[] };

const toArticles = (items: Item[]): ArticleOgp[] =>
  items
    .map((item) => ({ url: item.url, title: item.title || "", description: "", images: [], tags: item.tags || [] }))
    .filter((a) => a.title && a.title.trim() !== "");

/**
 * トップの記事一覧（旧 page.tsx と同じ組み立て）
 *  - Pickup / スクレイピングの最新記事: Qiita のプロフィールから
 *  - Latest: Qiita API の新しい順から、上の 2 つと重ならない 3 件
 */
export function usePublishedArticles() {
  return useQuery({
    queryKey: ["published-articles"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const scrape = await fetchQiitaProfile();
      const api = await contentApi.listQiitaItems({ page: 1, includeTags: true, perPage: 10 });
      const excluded = new Set([...scrape.pickupArticles, ...scrape.latestArticles].map((a) => a.url));
      const latest = api.items
        .filter((item) => !excluded.has(item.url))
        .slice(0, 3)
        .map((item) => ({ url: item.url, title: item.title, tags: item.tags.map((t) => t.name) }));
      return {
        pickupArticles: toArticles(scrape.pickupArticles),
        latestArticlesFromScrape: toArticles(scrape.latestArticles),
        latestArticles: toArticles(latest),
      };
    },
  });
}
