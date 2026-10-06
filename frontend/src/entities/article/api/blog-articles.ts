import { contentApi } from "@/shared/api/clients";
import type { ArticleOgp } from "../model/types";
import { fetchArticleLinks, fetchOgps } from "./content";

/** 1 ページあたりの記事数（旧 itemsPerPageAtom と同じ 6 件） */
export const BLOG_PER_PAGE = 6;

/** Markdown の本文から説明文を作る（最初の 200 文字。旧 blogs/page.tsx と同じ規則） */
export function descriptionFromBody(body: string): string {
  if (!body) return "";
  const plainText = body
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/#+\s+/g, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/\n+/g, " ")
    .trim()
    .substring(0, 200);
  return plainText + (plainText.length >= 200 ? "..." : "");
}

/** Qiita の記事 1 ページ分（タグ・本文付き）に OGP の画像と説明を補う */
export async function fetchBlogPage(page: number, perPage = BLOG_PER_PAGE): Promise<ArticleOgp[]> {
  const res = await contentApi.listQiitaItems({ page, includeTags: true, perPage });
  const items = res.items;
  if (items.length === 0) return [];
  const ogps = await fetchOgps(items.map((i) => i.url)).catch(() => [] as ArticleOgp[]);
  return items.map((item, index) => {
    const ogp = ogps[index];
    return {
      title: item.title || ogp?.title || "",
      description: descriptionFromBody(item.body) || ogp?.description || "",
      url: item.url,
      images: ogp?.images || [],
      tags: item.tags.map((t) => t.name),
    };
  });
}

/** チートシートのまとめ記事（「他のチートシート」のリンク元） */
export const CHEAT_SHEET_INDEX_URL = "https://qiita.com/JavaLangRuntimeException/items/6b46551f56e0def76eba";

/** まとめ記事からリンクを取れなかったときの一覧（旧 blogs/page.tsx の cheatSheetData と同じ） */
export const CHEAT_SHEET_FALLBACK = [
  { title: "git/gh コマンド(gitコマンド以外にもgitの概念も書いてあります)", url: "https://qiita.com/JavaLangRuntimeException/items/6b46551f56e0def76eba" },
  { title: "lazygit", url: "https://qiita.com/JavaLangRuntimeException/items/42087d09728d5739d73d" },
  { title: "Docker コマンド(dockerコマンド以外にもdockerの概念の記事へのリンクもあります)", url: "https://qiita.com/JavaLangRuntimeException/items/21f7c7bf3d143f821697" },
  { title: "ステータスコード", url: "https://qiita.com/JavaLangRuntimeException/items/ab1bc7b976ed2dfad91c" },
  { title: "TypeScript", url: "https://qiita.com/JavaLangRuntimeException/items/5894391c08e0d8e28389" },
  { title: "Go/Gorm", url: "https://qiita.com/JavaLangRuntimeException/items/d388717fc1436bc3ec9d" },
  { title: "testing/gomock", url: "https://qiita.com/JavaLangRuntimeException/items/bf521190f6f4d79e59fb" },
  { title: "C#/.NET/Unity", url: "https://qiita.com/JavaLangRuntimeException/items/7849b32bc223d4aa0247" },
  { title: "Ruby・Ruby on Rails", url: "https://qiita.com/JavaLangRuntimeException/items/42d935cf92c212f1c7ec" },
  { title: "SQL", url: "https://qiita.com/JavaLangRuntimeException/items/f038fbaccdd92fb0308a" },
  { title: "Vim", url: "https://qiita.com/JavaLangRuntimeException/items/0c68ab96ea198e0a7294" },
  { title: "プルリクエスト・マークダウン記法チートシート", url: "https://qiita.com/JavaLangRuntimeException/items/329eb92a47a07ff4dde8" },
  { title: "ファイル操作コマンドチートシート", url: "https://qiita.com/JavaLangRuntimeException/items/16f244606a73f7d106e4" },
  { title: "VSCode Github Copilot拡張機能", url: "https://qiita.com/JavaLangRuntimeException/items/be13dc3a346cf6e5ee44" },
  { title: "OpenAI Assistants API", url: "https://qiita.com/JavaLangRuntimeException/items/1a1abc01e8d7d05dce93" },
  { title: "GitHub API", url: "https://qiita.com/JavaLangRuntimeException/items/4f3551c31679233219ac" },
  { title: "変数・関数(メソッド)・クラス命名規則", url: "https://qiita.com/JavaLangRuntimeException/items/b93865c448f69bcfca4a" },
];

async function cheatSheetFallback(): Promise<ArticleOgp[]> {
  const ogps = await fetchOgps(CHEAT_SHEET_FALLBACK.map((c) => c.url)).catch(() => [] as ArticleOgp[]);
  return CHEAT_SHEET_FALLBACK.map((c, i) => ({
    title: ogps[i]?.title || c.title,
    description: ogps[i]?.description || "",
    url: ogps[i]?.url || c.url,
    images: ogps[i]?.images || [],
  }));
}

/** チートシート一覧: まとめ記事の「他のチートシート」のリンク + OGP。取れなければ固定の一覧 */
export async function fetchCheatSheetArticles(): Promise<ArticleOgp[]> {
  try {
    const links = await fetchArticleLinks(CHEAT_SHEET_INDEX_URL);
    if (links.length === 0) return cheatSheetFallback();
    const ogps = await fetchOgps(links.map((l) => l.url)).catch(() => [] as ArticleOgp[]);
    return links.map((link, i) => ({
      title: ogps[i]?.title || link.title || "",
      description: ogps[i]?.description || "",
      url: link.url,
      images: ogps[i]?.images || [],
      tags: [],
    }));
  } catch {
    return cheatSheetFallback();
  }
}
