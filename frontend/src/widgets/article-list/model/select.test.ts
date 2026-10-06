import { describe, expect, it, vi } from "vitest";

// API クライアントは window.location を使うので、純粋な関数のテストでは差し替える
vi.mock("@/shared/api/clients", () => ({ contentApi: {} }));
import type { ArticleOgp } from "@/entities/article";
import { descriptionFromBody } from "@/entities/article";
import { selectArticles, visibleArticles, type LoadedPages } from "./select";

const a = (n: number, title = `記事 ${n}`): ArticleOgp => ({ title, description: "", url: `https://qiita.com/x/items/${n}` });
const page = (from: number, count: number, title?: (n: number) => string) => Array.from({ length: count }, (_, i) => a(from + i, title?.(from + i)));
const base = { cheatSheet: [] as ArticleOgp[], series: "", search: "", currentPage: 1, perPage: 6 };

describe("selectArticles", () => {
  it("未選択: そのページの記事、次ページ未取得なら 1 つ先まで", () => {
    const pages: LoadedPages = new Map([[1, page(1, 6)]]);
    const v = selectArticles({ ...base, pages });
    expect(v.items.map((x) => x.url)).toHaveLength(6);
    expect(v.totalPages).toBe(2);
    expect(v.nextDisabled).toBe(false);
  });

  it("未選択: 6 件未満のページで終わり", () => {
    const pages: LoadedPages = new Map([[1, page(1, 6)], [2, page(7, 6)], [3, page(13, 2)]]);
    expect(selectArticles({ ...base, pages, currentPage: 3 })).toMatchObject({ totalPages: 3, nextDisabled: true });
    expect(selectArticles({ ...base, pages, currentPage: 1 })).toMatchObject({ totalPages: 3, nextDisabled: false });
  });

  it("未選択: 0 件のページで終わり", () => {
    const pages: LoadedPages = new Map([[1, page(1, 6)], [2, []]]);
    expect(selectArticles({ ...base, pages })).toMatchObject({ totalPages: 1, nextDisabled: true });
  });

  it("シリーズ: 取得済みの全記事をタイトルで絞って 6 件ずつ（Project Gopher は短い語で）", () => {
    const gopher = (n: number) => (n % 2 ? `Project Gopher #${n}` : `その他 ${n}`);
    const pages: LoadedPages = new Map([[1, page(1, 6, gopher)], [2, page(7, 6, gopher)], [3, page(13, 6, gopher)]]);
    const v = selectArticles({ ...base, pages, series: "Project Gopher: Unlocking Go's Secrets" });
    expect(v.items).toHaveLength(6);
    expect(v.totalPages).toBe(2);
    expect(selectArticles({ ...base, pages, series: "Project Gopher: Unlocking Go's Secrets", currentPage: 2 }).items).toHaveLength(3);
  });

  it("検索: 大文字小文字を無視、全件表示（シリーズ内・チートシート内でも）", () => {
    const pages: LoadedPages = new Map([[1, [a(1, "Go入門"), a(2, "TypeScript"), a(3, "golang tips")]]]);
    expect(selectArticles({ ...base, pages, search: "GO" }).items.map((x) => x.title)).toEqual(["Go入門", "golang tips"]);
    const cheat = [a(10, "Vim"), a(11, "SQL")];
    expect(selectArticles({ ...base, pages, cheatSheet: cheat, series: "チートシート", search: "vi" }).items.map((x) => x.title)).toEqual(["Vim"]);
  });

  it("チートシート: 全件・ページ送りなし", () => {
    const cheat = page(1, 17);
    expect(selectArticles({ ...base, pages: new Map(), cheatSheet: cheat, series: "チートシート" })).toMatchObject({ paginated: false, totalPages: 1 });
  });
});

describe("visibleArticles / descriptionFromBody", () => {
  it("タイトルなしと重複 URL は出さない", () => {
    expect(visibleArticles([a(1), { ...a(2), title: " " }, a(1)]).map((x) => x.url)).toEqual([a(1).url]);
  });
  it("Markdown を除いて 200 文字", () => {
    expect(descriptionFromBody("# 見出し\n**太字** と `code` と [リンク](https://x)\n```\nblock\n```")).toBe("見出し 太字 と  と リンク");
    expect(descriptionFromBody("あ".repeat(250))).toBe("あ".repeat(200) + "...");
  });
});
