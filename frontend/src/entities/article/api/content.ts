import { contentApi } from "@/shared/api/clients";
import type { ArticleOgp } from "../model/types";

/** Qiita の記事 URL（ページ単位）。旧 /api/qiita と同じ */
export async function fetchQiitaUrls(page: number, initial = false): Promise<string[]> {
  return (await contentApi.listQiitaItems({ page, initial })).urls;
}

/** 複数 URL の OGP（qiita.com のみ。サーバーで 1 年キャッシュ）。旧 /api/ogp と同じ */
export async function fetchOgps(urls: string[], noCache = false): Promise<ArticleOgp[]> {
  if (urls.length === 0) return [];
  const res = await contentApi.getOgp({ urls, noCache });
  return res.data.map((o) => ({ title: o.title, description: o.description, url: o.url, images: o.images }));
}

/** Qiita のプロフィールから Pickup / Latest 記事（旧 /api/qiita-scrape） */
export async function fetchQiitaProfile() {
  const res = await contentApi.scrapeQiitaProfile({});
  const map = (a: { url: string; title: string; tags: string[] }) => ({ url: a.url, title: a.title, tags: a.tags });
  return { pickupArticles: res.pickupArticles.map(map), latestArticles: res.latestArticles.map(map) };
}

/** まとめ記事の中のリンク（旧 /api/qiita-scrape-article） */
export async function fetchArticleLinks(url: string) {
  return (await contentApi.scrapeQiitaArticleLinks({ url })).links.map((l) => ({ url: l.url, title: l.title }));
}
