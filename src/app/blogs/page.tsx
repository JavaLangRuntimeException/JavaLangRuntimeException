"use client";

import React from "react";
import { motion } from "framer-motion";
import { atom, useAtom } from "jotai";
import { qiitaUrlsAtom, ogpCacheAtom, isFetchingAtom, hasMoreAtom, currentPageAtom } from "../../components/BackgroundFetcher";
import dynamic from "next/dynamic";
const BackgroundFetcher = dynamic(() => import("../../components/BackgroundFetcher").then(m => m.BackgroundFetcher), { ssr: false });
import { fetchMultipleOgp, getCacheStats, type OGPResponse } from "./server";
import Link from "next/link";
import Image from 'next/image';
import { HeroBackground } from "../../shared/ui/HeroBackground";

const searchAtom = atom("");

interface Ogp {
    title: string;
    description: string;
    url: string;
    images?: string[];
    tags?: string[];
}

// ローカルストレージキャッシュの設定（既存のOGP取得用）
const LOCAL_STORAGE_KEY = 'taramanji_qiita_ogp_cache';
const ARTICLES_CACHE_KEY = 'taramanji_qiita_articles_cache';
const CACHE_DURATION =  1 * 24 * 60 * 60 * 1000; // 1日間（ミリ秒）

interface CachedOgpData {
    data: OGPResponse;
    timestamp: number;
}

/**
 * ローカルストレージからキャッシュを取得
 */
function getLocalStorageCache(): Record<string, CachedOgpData> {
    if (typeof window === 'undefined') return {};

    try {
        const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
        return cached ? JSON.parse(cached) : {};
    } catch (error) {
        console.error("Error reading from localStorage:", error);
        return {};
    }
}

/**
 * ローカルストレージにキャッシュを保存
 */
function saveToLocalStorage(cache: Record<string, CachedOgpData>): void {
    if (typeof window === 'undefined') return;

    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cache));
    } catch (error) {
        console.error("Error saving to localStorage:", error);
    }
}

/**
 * キャッシュの有効性をチェック
 */
function isCacheValid(cachedData: CachedOgpData | CachedArticlesData): boolean {
    const now = Date.now();
    return (now - cachedData.timestamp) < CACHE_DURATION;
}

/**
 * 期限切れキャッシュをクリーンアップ
 */
function cleanupExpiredLocalCache(): void {
    if (typeof window === 'undefined') return;

    const cache = getLocalStorageCache();
    const cleanedCache: Record<string, CachedOgpData> = {};
    let cleanedCount = 0;

    for (const [url, cachedData] of Object.entries(cache)) {
        if (isCacheValid(cachedData)) {
            cleanedCache[url] = cachedData;
        } else {
            cleanedCount++;
        }
    }

    if (cleanedCount > 0) {
        console.log(`Cleaned up ${cleanedCount} expired localStorage entries`);
        saveToLocalStorage(cleanedCache);
    }
}

/**
 * OGP情報が不完全かどうかをチェック
 */
function isOgpIncomplete(ogpData: OGPResponse): boolean {
    // 画像がない、またはタイトルがない場合、不完全とみなす
    const hasImages = ogpData.images && ogpData.images.length > 0 && ogpData.images[0];
    const hasTitle = ogpData.title && ogpData.title.trim() !== "";
    return !hasImages || !hasTitle;
}

/**
 * 複数URLのOGP情報を効率的に取得（ローカルキャッシュ活用）
 * 不完全なOGP情報がある場合も再取得を試みる
 */
async function fetchOgpWithLocalCache(urls: string[], retryIncomplete: boolean = true): Promise<Ogp[]> {
    const cache = getLocalStorageCache();
    const results: (Ogp | null)[] = [];
    const urlsToFetch: { url: string; index: number }[] = [];

    // 既存キャッシュをチェック
    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        const cachedData = cache[url];
        if (cachedData && isCacheValid(cachedData)) {
            // 不完全なOGPの場合、再取得を試みる
            if (retryIncomplete && isOgpIncomplete(cachedData.data)) {
                console.log(`[OGP] Incomplete OGP detected for ${url}, will retry fetching`);
                urlsToFetch.push({ url, index: i });
                results[i] = null; // プレースホルダー
            } else {
                // キャッシュから復元
                results[i] = {
                    title: cachedData.data.title || "",
                    description: cachedData.data.description || "",
                    url: cachedData.data.url || url,
                    images: cachedData.data.images || []
                };
            }
        } else {
            // 新規取得が必要
            urlsToFetch.push({ url, index: i });
            results[i] = null; // プレースホルダー
        }
    }

    // 新規取得が必要なURLがある場合
    if (urlsToFetch.length > 0) {
        console.log(`Fetching ${urlsToFetch.length} new OGP data entries from server`);

        try {
            const urlsOnly = urlsToFetch.map(item => item.url);
            const newOgpData = await fetchMultipleOgp(urlsOnly);

            // 結果をマージし、キャッシュに保存
            const updatedCache = { ...cache };

            for (let i = 0; i < urlsToFetch.length; i++) {
                const { url, index } = urlsToFetch[i];
                const ogpData = newOgpData[i];

                // OGPデータが取得できた場合のみ更新
                if (ogpData && (ogpData.title || (ogpData.images && ogpData.images.length > 0))) {
                    results[index] = {
                        title: ogpData.title || "",
                        description: ogpData.description || "",
                        url: ogpData.url || url,
                        images: ogpData.images || []
                    };

                    // ローカルキャッシュに保存（不完全なデータでも保存）
                    updatedCache[url] = {
                        data: ogpData,
                        timestamp: Date.now()
                    };
                } else {
                    // OGPデータが取得できなかった場合、既存のキャッシュがあればそれを使用
                    const existingCache = cache[url];
                    if (existingCache && existingCache.data) {
                        results[index] = {
                            title: existingCache.data.title || "",
                            description: existingCache.data.description || "",
                            url: existingCache.data.url || url,
                            images: existingCache.data.images || []
                        };
                    } else {
                        // フォールバック値
                        results[index] = {
                            title: "",
                            description: "",
                            url: url,
                            images: []
                        };
                    }
                }
            }

            saveToLocalStorage(updatedCache);
        } catch (error) {
            console.error("Error fetching OGP data:", error);

            // エラー時は既存のキャッシュがあればそれを使用、なければフォールバック値を設定
            for (const { url, index } of urlsToFetch) {
                if (results[index] === null) {
                    const existingCache = cache[url];
                    if (existingCache && existingCache.data) {
                        results[index] = {
                            title: existingCache.data.title || "",
                            description: existingCache.data.description || "",
                            url: existingCache.data.url || url,
                            images: existingCache.data.images || []
                        };
                    } else {
                        results[index] = {
                            title: "",
                            description: "",
                            url: url, // 元のURLを保持
                            images: []
                        };
                    }
                }
            }
        }
    }

    // nullの要素を除外してOgp[]として返す
    return results.filter((result): result is Ogp => result !== null);
}

/**
 * 記事データのキャッシュ関連関数
 */
interface CachedArticlesData {
    articles: Ogp[];
    timestamp: number;
}

interface ArticlesCache {
    [page: number]: CachedArticlesData;
}

/**
 * ローカルストレージから記事キャッシュを取得
 */
function getArticlesCache(): ArticlesCache {
    if (typeof window === 'undefined') return {};

    try {
        const cached = localStorage.getItem(ARTICLES_CACHE_KEY);
        return cached ? JSON.parse(cached) : {};
    } catch (error) {
        console.error("Error reading articles cache from localStorage:", error);
        return {};
    }
}

/**
 * ローカルストレージに記事キャッシュを保存
 */
function saveArticlesCache(cache: ArticlesCache): void {
    if (typeof window === 'undefined') return;

    try {
        localStorage.setItem(ARTICLES_CACHE_KEY, JSON.stringify(cache));
    } catch (error) {
        console.error("Error saving articles cache to localStorage:", error);
    }
}

/**
 * 記事キャッシュからページの記事を取得
 */
function getCachedArticles(page: number): Ogp[] | null {
    const cache = getArticlesCache();
    const cachedData = cache[page];

    if (cachedData && isCacheValid(cachedData)) {
        console.log(`[BlogPage] Using cached articles for page ${page}`);
        return cachedData.articles;
    }

    return null;
}

/**
 * 記事キャッシュにページの記事を保存
 */
function saveArticlesToCache(page: number, articles: Ogp[]): void {
    const cache = getArticlesCache();
    cache[page] = {
        articles,
        timestamp: Date.now()
    };
    saveArticlesCache(cache);
    console.log(`[BlogPage] Cached articles for page ${page}`);
}

// チートシート記事の静的データ
const cheatSheetData = [
    {
        title: "git/gh コマンド(gitコマンド以外にもgitの概念も書いてあります)",
        url: "https://qiita.com/JavaLangRuntimeException/items/6b46551f56e0def76eba"
    },
    {
        title: "lazygit",
        url: "https://qiita.com/JavaLangRuntimeException/items/42087d09728d5739d73d"
    },
    {
        title: "Docker コマンド(dockerコマンド以外にもdockerの概念の記事へのリンクもあります)",
        url: "https://qiita.com/JavaLangRuntimeException/items/21f7c7bf3d143f821697"
    },
    {
        title: "ステータスコード",
        url: "https://qiita.com/JavaLangRuntimeException/items/ab1bc7b976ed2dfad91c"
    },
    {
        title: "TypeScript",
        url: "https://qiita.com/JavaLangRuntimeException/items/5894391c08e0d8e28389"
    },
    {
        title: "Go/Gorm",
        url: "https://qiita.com/JavaLangRuntimeException/items/d388717fc1436bc3ec9d"
    },
    {
        title: "testing/gomock",
        url: "https://qiita.com/JavaLangRuntimeException/items/bf521190f6f4d79e59fb"
    },
    {
        title: "C#/.NET/Unity",
        url: "https://qiita.com/JavaLangRuntimeException/items/7849b32bc223d4aa0247"
    },
    {
        title: "Ruby・Ruby on Rails",
        url: "https://qiita.com/JavaLangRuntimeException/items/42d935cf92c212f1c7ec"
    },
    {
        title: "SQL",
        url: "https://qiita.com/JavaLangRuntimeException/items/f038fbaccdd92fb0308a"
    },
    {
        title: "Vim",
        url: "https://qiita.com/JavaLangRuntimeException/items/0c68ab96ea198e0a7294"
    },
    {
        title: "プルリクエスト・マークダウン記法チートシート",
        url: "https://qiita.com/JavaLangRuntimeException/items/329eb92a47a07ff4dde8"
    },
    {
        title: "ファイル操作コマンドチートシート",
        url: "https://qiita.com/JavaLangRuntimeException/items/16f244606a73f7d106e4"
    },
    {
        title: "VSCode Github Copilot拡張機能",
        url: "https://qiita.com/JavaLangRuntimeException/items/be13dc3a346cf6e5ee44"
    },
    {
        title: "OpenAI Assistants API",
        url: "https://qiita.com/JavaLangRuntimeException/items/1a1abc01e8d7d05dce93"
    },
    {
        title: "GitHub API",
        url: "https://qiita.com/JavaLangRuntimeException/items/4f3551c31679233219ac"
    },
    {
        title: "変数・関数(メソッド)・クラス命名規則",
        url: "https://qiita.com/JavaLangRuntimeException/items/b93865c448f69bcfca4a"
    }
];

const seriesList = [
    "チートシート",
    "TypeScriptで学ぶプログラミングの世界",
    "IAM AWS User クラウドサービスをフル活用しよう！",
    "Project Gopher: Unlocking Go's Secrets",
];

// シリーズ名から実際にフィルタリングするキーワードを取得
function getSeriesFilterKeyword(seriesName: string): string {
    if (seriesName === "Project Gopher: Unlocking Go's Secrets") {
        return "Project Gopher";
    }
    return seriesName;
}

export default function BlogsPage() {
    const [searchText, setSearchText] = useAtom(searchAtom);
    const [loading, setLoading] = React.useState(false);
    const [selectedSeries, setSelectedSeries] = React.useState("");
    const [articlesByPage, setArticlesByPage] = React.useState<Map<number, Ogp[]>>(new Map());
    const [cheatSheetArticles, setCheatSheetArticles] = React.useState<Ogp[]>([]);
    const [currentPage, setCurrentPage] = React.useState(1);
    const itemsPerPage = 6;
    const [cacheStats, setCacheStats] = React.useState<{
        localCacheSize: number;
        serverCacheSize: number;
    }>({ localCacheSize: 0, serverCacheSize: 0 });

    // グローバル状態から取得
    const qiitaUrls = useAtom(qiitaUrlsAtom)[0];
    const ogpCache = useAtom(ogpCacheAtom)[0];
    const isFetching = useAtom(isFetchingAtom)[0];
    const hasMore = useAtom(hasMoreAtom)[0];
    const backgroundCurrentPage = useAtom(currentPageAtom)[0];



    // 初期化時にキャッシュクリーンアップを実行
    React.useEffect(() => {
        cleanupExpiredLocalCache();

        // 記事キャッシュのクリーンアップ
        const articlesCache = getArticlesCache();
        const cleanedArticlesCache: ArticlesCache = {};
        for (const [page, cachedData] of Object.entries(articlesCache)) {
            if (isCacheValid(cachedData)) {
                cleanedArticlesCache[Number(page)] = cachedData;
            }
        }
        if (Object.keys(cleanedArticlesCache).length !== Object.keys(articlesCache).length) {
            saveArticlesCache(cleanedArticlesCache);
            console.log(`[BlogPage] Cleaned up expired articles cache`);
        }

        // キャッシュ統計を更新
        const updateCacheStats = async () => {
            const localCache = getLocalStorageCache();
            const serverStats = await getCacheStats();
            setCacheStats({
                localCacheSize: Object.keys(localCache).length,
                serverCacheSize: serverStats.cacheSize
            });
        };
        updateCacheStats();
    }, []);

    // チートシート記事から「他のチートシート」セクションのリンクをスクレイピング
    const fetchCheatSheetFromArticle = React.useCallback(async () => {
        try {
            setLoading(true);
            console.log('[BlogPage] Scraping cheat sheet links from article...');

            // 指定された記事をスクレイピング
            const scrapeRes = await fetch(`/api/qiita-scrape-article?url=https://qiita.com/JavaLangRuntimeException/items/6b46551f56e0def76eba&t=${Date.now()}`, {
                cache: "no-store"
            });
            const scrapeJson: {
                links?: Array<{ url: string; title: string }>
            } = await scrapeRes.json();

            const links = scrapeJson?.links || [];
            console.log(`[BlogPage] Found ${links.length} cheat sheet links`);

            if (links.length > 0) {
                const urls = links.map(link => link.url);
                const ogpResults = await fetchOgpWithLocalCache(urls);

                // OGP情報とスクレイピング結果を結合
                const finalResults: Ogp[] = links.map((link, index) => {
                    const ogp = ogpResults[index] || {};
                    return {
                        title: ogp.title || link.title || "",
                        description: ogp.description || "",
                        url: link.url,
                        images: ogp.images || [],
                        tags: []
                    };
                });

                console.log(`[BlogPage] Cheat sheet articles loaded: ${finalResults.length} items`);
                setCheatSheetArticles(finalResults);
            } else {
                // リンクが見つからない場合はフォールバック
                console.warn('[BlogPage] No cheat sheet links found, using fallback');
                const urls = cheatSheetData.map(item => item.url);
                const ogpResults = await fetchOgpWithLocalCache(urls);
                const fallbackResults = ogpResults.map((ogp, index) => ({
                    title: ogp.title || cheatSheetData[index].title,
                    description: ogp.description || "",
                    url: ogp.url || cheatSheetData[index].url,
                    images: ogp.images || []
                }));
                setCheatSheetArticles(fallbackResults);
            }
        } catch (error) {
            console.error("[BlogPage] Error fetching cheat sheet from article:", error);
            // エラー時はフォールバック
            const urls = cheatSheetData.map(item => item.url);
            const ogpResults = await fetchOgpWithLocalCache(urls);
            const fallbackResults = ogpResults.map((ogp, index) => ({
                title: ogp.title || cheatSheetData[index].title,
                description: ogp.description || "",
                url: ogp.url || cheatSheetData[index].url,
                images: ogp.images || []
            }));
            setCheatSheetArticles(fallbackResults);
        } finally {
            setLoading(false);
        }
    }, []);

    // 手動でQiita記事をfetchする関数（バックグラウンドfetchが動かない場合の対策）- タグ情報を先に取得し、タイトルやOGPはQiita APIで取得
    // 現在は使用していない（ページごとに取得する方式に変更）
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const manualFetchQiitaArticles = React.useCallback(async () => {
        if (isFetching || qiitaUrls.length > 0) return; // 既にfetch中または取得済み

        try {
            setLoading(true);
            console.log("Manual fetch of Qiita articles...");

            // まずタグ情報を含めて取得
            const itemsRes = await fetch(`/api/qiita?page=1&initial=1&includeTags=1`, { cache: "no-store" });
            const itemsJson: { items?: Array<{ url: string; title: string; tags: Array<{ name: string }> }> } = await itemsRes.json();
            const items = itemsJson?.items || [];

            if (items.length > 0) {
                console.log(`Manual fetch got ${items.length} items`);

                // URLとタグのマッピングを作成
                const urlToTagsMap = new Map<string, string[]>();
                items.forEach(item => {
                    urlToTagsMap.set(item.url, item.tags.map(tag => tag.name));
                });

                // その後、Qiita APIからタイトルを取得
                const articlesData: Ogp[] = items.map(item => ({
                    title: item.title || "",
                    description: "",
                    url: item.url,
                    images: [],
                    tags: urlToTagsMap.get(item.url) || []
                }));

                // 現在は使用していない（ページごとに取得する方式に変更）
                // setArticles(articlesData);

                // OGP情報も取得（画像や説明文の補完）
                const urls = items.map(item => item.url);
                const batchSize = 5;

                for (let i = 0; i < urls.length; i += batchSize) {
                    const batch = urls.slice(i, i + batchSize);
                    const ogpResults = await fetchOgpWithLocalCache(batch);

                    ogpResults.forEach((ogp, index) => {
                        const url = batch[index];
                        const articleIndex = articlesData.findIndex(a => a.url === url);
                        if (articleIndex >= 0) {
                            articlesData[articleIndex] = {
                                ...articlesData[articleIndex],
                                description: articlesData[articleIndex].description || ogp.description || "",
                                images: articlesData[articleIndex].images?.length ? articlesData[articleIndex].images : ogp.images || []
                            };
                        }
                    });

                    // 現在は使用していない（ページごとに取得する方式に変更）
                    // setArticles([...articlesData]);

                    // 次のバッチ取得前に少し待機
                    if (i + batchSize < urls.length) {
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }
                }

                // 現在は使用していない（ページごとに取得する方式に変更）
                // setArticles(articlesData);
                console.log(`Manual fetch completed: ${articlesData.length} articles`);
            }
        } catch (error) {
            console.error("Manual fetch error:", error);
        } finally {
            setLoading(false);
        }
    }, [isFetching, qiitaUrls.length]);

    // タグ情報を取得する関数（Qiita APIから取得）
    // 現在は使用していない（ページごとに取得する方式に変更）
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const fetchTagsForUrls = React.useCallback(async (urls: string[]): Promise<Map<string, string[]>> => {
        const urlToTagsMap = new Map<string, string[]>();
        try {
            // バッチ処理で少しずつ取得（ページごとに取得）
            // URLからページ番号を推測して取得
            const pageSize = 20;
            const pages = Math.ceil(urls.length / pageSize);

            for (let page = 1; page <= pages; page++) {
                try {
                    const itemsRes = await fetch(`/api/qiita?page=${page}&includeTags=1`, { cache: "no-store" });
                    const itemsJson: { items?: Array<{ url: string; tags: Array<{ name: string }> }> } = await itemsRes.json();
                    const items = itemsJson?.items || [];

                    items.forEach(item => {
                        if (urls.includes(item.url)) {
                            urlToTagsMap.set(item.url, item.tags.map(tag => tag.name));
                        }
                    });

                    // 次のページ取得前に少し待機
                    if (page < pages) {
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }
                } catch (error) {
                    console.error(`Error fetching tags for page ${page}:`, error);
                }
            }
        } catch (error) {
            console.error("Error fetching tags:", error);
        }
        return urlToTagsMap;
    }, []);

    // ページごとにQiita APIから記事を取得（非チートシートのみ）
    const [pageLoading, setPageLoading] = React.useState(false);
    const [fetchedPages, setFetchedPages] = React.useState<Set<number>>(new Set());

    // 現在のページの記事を取得
    React.useEffect(() => {
        if (selectedSeries === "チートシート") {
            return;
        }

        const fetchPageArticles = async () => {
            // 既に取得済みのページの場合はスキップ
            if (fetchedPages.has(currentPage)) {
                setPageLoading(false);
                return;
            }

            // キャッシュから取得を試みる
            const cachedArticles = getCachedArticles(currentPage);
            if (cachedArticles) {
                setArticlesByPage(prev => {
                    const newMap = new Map(prev);
                    newMap.set(currentPage, cachedArticles);
                    return newMap;
                });
                setFetchedPages(prev => new Set([...prev, currentPage]));
                setPageLoading(false);
                console.log(`[BlogPage] Loaded ${cachedArticles.length} articles from cache for page ${currentPage}`);

                // 6件取得できた場合、次のページも裏で取得開始
                if (cachedArticles.length === 6) {
                    const nextPage = currentPage + 1;
                    if (!fetchedPages.has(nextPage)) {
                        console.log(`[BlogPage] Prefetching page ${nextPage} in background...`);
                        fetchPageInBackground(nextPage);
                    }
                }
                return;
            }

            setPageLoading(true);
            console.log(`[BlogPage] Fetching page ${currentPage} articles...`);

            try {
                // 現在のページの記事を取得（1ページあたり6件）
                const itemsRes = await fetch(`/api/qiita?page=${currentPage}&includeTags=1&perPage=${itemsPerPage}`, { cache: "no-store" });
                const itemsJson: { items?: Array<{ url: string; title: string; body?: string; tags: Array<{ name: string }> }> } = await itemsRes.json();
                const items = itemsJson?.items || [];

                if (items.length > 0) {
                    const urls = items.map(item => item.url);

                    // OGP情報を取得
                    const ogpResults = await fetchOgpWithLocalCache(urls);

                    // 記事データを作成
                    const pageArticles: Ogp[] = items.map((item, index) => {
                        const ogp = ogpResults[index] || {};
                        // bodyから説明文を生成（Markdownの最初の数行を抜粋）
                        let description = "";
                        if (item.body) {
                            // MarkdownからHTMLタグを除去し、最初の200文字を取得
                            const plainText = item.body
                                .replace(/```[\s\S]*?```/g, '') // コードブロックを除去
                                .replace(/`[^`]+`/g, '') // インラインコードを除去
                                .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // リンクをテキストに変換
                                .replace(/#+\s+/g, '') // 見出し記号を除去
                                .replace(/\*\*/g, '') // 太字記号を除去
                                .replace(/\*/g, '') // 斜体記号を除去
                                .replace(/\n+/g, ' ') // 改行をスペースに変換
                                .trim()
                                .substring(0, 200);
                            description = plainText + (plainText.length >= 200 ? '...' : '');
                        }

                        return {
                            title: item.title || ogp.title || "",
                            description: description || ogp.description || "",
                            url: item.url,
                            images: ogp.images || [],
                            tags: item.tags.map(tag => tag.name) || []
                        };
                    });

                    // ページごとに記事を保存
                    setArticlesByPage(prev => {
                        const newMap = new Map(prev);
                        newMap.set(currentPage, pageArticles);
                        return newMap;
                    });

                    // キャッシュに保存
                    saveArticlesToCache(currentPage, pageArticles);

                    setFetchedPages(prev => new Set([...prev, currentPage]));
                    console.log(`[BlogPage] Fetched ${pageArticles.length} articles for page ${currentPage}`);

                    // 6件取得できた場合、次のページも裏で取得開始
                    if (items.length === 6) {
                        const nextPage = currentPage + 1;
                        if (!fetchedPages.has(nextPage)) {
                            console.log(`[BlogPage] Prefetching page ${nextPage} in background...`);
                            fetchPageInBackground(nextPage);
                        }
                    }
                }
            } catch (error) {
                console.error(`Error fetching page ${currentPage} articles:`, error);
            } finally {
                setPageLoading(false);
            }
        };

        // 裏でページを取得する関数
        const fetchPageInBackground = async (page: number) => {
            // 既に取得済みまたはキャッシュがある場合はスキップ
            if (fetchedPages.has(page)) {
                return;
            }

            // キャッシュから取得を試みる
            const cachedArticles = getCachedArticles(page);
            if (cachedArticles) {
                setArticlesByPage(prev => {
                    const newMap = new Map(prev);
                    newMap.set(page, cachedArticles);
                    return newMap;
                });
                setFetchedPages(prev => new Set([...prev, page]));
                console.log(`[BlogPage] Loaded ${cachedArticles.length} articles from cache for page ${page}`);

                // 次のページも裏で取得（6件取得できた場合）
                if (cachedArticles.length === 6) {
                    const nextPage = page + 1;
                    if (!fetchedPages.has(nextPage)) {
                        setTimeout(() => fetchPageInBackground(nextPage), 1000);
                    }
                }
                return;
            }

            try {
                const itemsRes = await fetch(`/api/qiita?page=${page}&includeTags=1&perPage=${itemsPerPage}`, { cache: "no-store" });
                const itemsJson: { items?: Array<{ url: string; title: string; body?: string; tags: Array<{ name: string }> }> } = await itemsRes.json();
                const items = itemsJson?.items || [];

                if (items.length > 0) {
                    const urls = items.map(item => item.url);
                    const ogpResults = await fetchOgpWithLocalCache(urls);

                    const pageArticles: Ogp[] = items.map((item, index) => {
                        const ogp = ogpResults[index] || {};
                        let description = "";
                        if (item.body) {
                            const plainText = item.body
                                .replace(/```[\s\S]*?```/g, '')
                                .replace(/`[^`]+`/g, '')
                                .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
                                .replace(/#+\s+/g, '')
                                .replace(/\*\*/g, '')
                                .replace(/\*/g, '')
                                .replace(/\n+/g, ' ')
                                .trim()
                                .substring(0, 200);
                            description = plainText + (plainText.length >= 200 ? '...' : '');
                        }

                        return {
                            title: item.title || ogp.title || "",
                            description: description || ogp.description || "",
                            url: item.url,
                            images: ogp.images || [],
                            tags: item.tags.map(tag => tag.name) || []
                        };
                    });

                    setArticlesByPage(prev => {
                        const newMap = new Map(prev);
                        newMap.set(page, pageArticles);
                        return newMap;
                    });

                    // キャッシュに保存
                    saveArticlesToCache(page, pageArticles);

                    setFetchedPages(prev => new Set([...prev, page]));
                    console.log(`[BlogPage] Prefetched ${pageArticles.length} articles for page ${page}`);

                    // 次のページも裏で取得（6件取得できた場合）
                    if (items.length === 6) {
                        const nextPage = page + 1;
                        if (!fetchedPages.has(nextPage)) {
                            setTimeout(() => fetchPageInBackground(nextPage), 1000); // 1秒待ってから次のページを取得
                        }
                    }
                }
            } catch (error) {
                console.error(`Error prefetching page ${page} articles:`, error);
            }
        };

        fetchPageArticles();
    }, [currentPage, selectedSeries, itemsPerPage, fetchedPages]);

    // チートシート選択時の処理
    React.useEffect(() => {
        console.log(`useEffect triggered: selectedSeries="${selectedSeries}"`);
        if (selectedSeries === "チートシート") {
            console.log(`[BlogPage] Cheat sheet selected, scraping from article...`);
            fetchCheatSheetFromArticle();
        }
    }, [selectedSeries, fetchCheatSheetFromArticle]);

    const filteredData = React.useMemo(() => {
        let filtered: Ogp[] = [];

        // シリーズが選択されている場合
        if (selectedSeries) {
            if (selectedSeries === "チートシート") {
                filtered = cheatSheetArticles;
            } else {
                // シリーズ選択時：全キャッシュから記事を取得
                const allCachedArticles: Ogp[] = [];
                const articlesCache = getArticlesCache();

                // キャッシュから全ページの記事を取得
                for (const [, cachedData] of Object.entries(articlesCache)) {
                    if (isCacheValid(cachedData)) {
                        allCachedArticles.push(...cachedData.articles);
                    }
                }

                // ページごとに保存された記事を順番に結合
                const allPagesArticles: Ogp[] = [];
                const sortedPages = Array.from(articlesByPage.keys()).sort((a, b) => a - b);
                sortedPages.forEach(page => {
                    const pageArticles = articlesByPage.get(page) || [];
                    allPagesArticles.push(...pageArticles);
                });

                // バックグラウンドで取得された記事（ogpCache）も含める
                const backgroundArticles: Ogp[] = [];
                if (qiitaUrls && ogpCache) {
                    qiitaUrls.forEach(url => {
                        const ogp = ogpCache[url];
                        if (ogp && ogp.title) {
                            backgroundArticles.push({
                                title: ogp.title,
                                description: ogp.description || "",
                                url: url,
                                images: ogp.images || [],
                                tags: []
                            });
                        }
                    });
                }

                // すべての記事を結合（重複を除外）
                const allArticlesMap = new Map<string, Ogp>();
                [...allCachedArticles, ...allPagesArticles, ...backgroundArticles].forEach(article => {
                    if (!allArticlesMap.has(article.url)) {
                        allArticlesMap.set(article.url, article);
                    }
                });
                filtered = Array.from(allArticlesMap.values());

                // シリーズ名でフィルタリング
                const filterKeyword = getSeriesFilterKeyword(selectedSeries);
                filtered = filtered.filter((ogpObj) => {
                    const title = ogpObj.title || "";
                    return title.includes(filterKeyword);
                });
                console.log(`[BlogPage] Filtered by series "${selectedSeries}" (keyword: "${filterKeyword}"):`, filtered.length, 'articles');
            }

            // シリーズ選択時：フィルターした記事の中から検索を適用
            if (searchText.trim()) {
                const key = searchText.toLowerCase();
                filtered = filtered.filter((ogpObj) => {
                    const title = (ogpObj.title || "").toLowerCase();
                    return title.includes(key);
                });
                console.log(`[BlogPage] Searched within filtered series articles:`, filtered.length, 'articles');
            }
        } else {
            // シリーズが選択されていない場合
            if (searchText.trim()) {
                // 検索テキストがある場合、全キャッシュから記事を取得
                const allCachedArticles: Ogp[] = [];
                const articlesCache = getArticlesCache();

                // キャッシュから全ページの記事を取得
                for (const [, cachedData] of Object.entries(articlesCache)) {
                    if (isCacheValid(cachedData)) {
                        allCachedArticles.push(...cachedData.articles);
                    }
                }

                // ページごとに保存された記事を順番に結合
                const allPagesArticles: Ogp[] = [];
                const sortedPages = Array.from(articlesByPage.keys()).sort((a, b) => a - b);
                sortedPages.forEach(page => {
                    const pageArticles = articlesByPage.get(page) || [];
                    allPagesArticles.push(...pageArticles);
                });

                // バックグラウンドで取得された記事（ogpCache）も含める
                const backgroundArticles: Ogp[] = [];
                if (qiitaUrls && ogpCache) {
                    qiitaUrls.forEach(url => {
                        const ogp = ogpCache[url];
                        if (ogp && ogp.title) {
                            backgroundArticles.push({
                                title: ogp.title,
                                description: ogp.description || "",
                                url: url,
                                images: ogp.images || [],
                                tags: []
                            });
                        }
                    });
                }

                // すべての記事を結合（重複を除外）
                const allArticlesMap = new Map<string, Ogp>();
                [...allCachedArticles, ...allPagesArticles, ...backgroundArticles].forEach(article => {
                    if (!allArticlesMap.has(article.url)) {
                        allArticlesMap.set(article.url, article);
                    }
                });
                filtered = Array.from(allArticlesMap.values());

                // 検索フィルタリング（大文字小文字を無視）
                const key = searchText.toLowerCase();
                filtered = filtered.filter((ogpObj) => {
                    const title = (ogpObj.title || "").toLowerCase();
                    return title.includes(key);
                });
            } else {
                // ページごとに保存された記事を順番に結合
                const allPagesArticles: Ogp[] = [];
                const sortedPages = Array.from(articlesByPage.keys()).sort((a, b) => a - b);
                sortedPages.forEach(page => {
                    const pageArticles = articlesByPage.get(page) || [];
                    allPagesArticles.push(...pageArticles);
                });

                // バックグラウンドで取得された記事（ogpCache）も含める
                const backgroundArticles: Ogp[] = [];
                if (qiitaUrls && ogpCache) {
                    qiitaUrls.forEach(url => {
                        const ogp = ogpCache[url];
                        if (ogp && ogp.title) {
                            backgroundArticles.push({
                                title: ogp.title,
                                description: ogp.description || "",
                                url: url,
                                images: ogp.images || [],
                                tags: []
                            });
                        }
                    });
                }

                // すべての記事を結合（重複を除外）
                const allArticlesMap = new Map<string, Ogp>();
                [...allPagesArticles, ...backgroundArticles].forEach(article => {
                    if (!allArticlesMap.has(article.url)) {
                        allArticlesMap.set(article.url, article);
                    }
                });
                filtered = Array.from(allArticlesMap.values());
            }
        }

        console.log(`Filtered data for rendering:`, filtered.length, 'articles');
        const totalArticles = selectedSeries === "チートシート" ? cheatSheetArticles.length : Array.from(articlesByPage.values()).flat().length;
        console.log(`Selected series: "${selectedSeries}", Articles count: ${totalArticles}, CheatSheet count: ${cheatSheetArticles.length}`);
        console.log(`Background fetch status: fetching=${isFetching}, hasMore=${hasMore}, backgroundCurrentPage=${backgroundCurrentPage}`);

        return filtered;
    }, [articlesByPage, cheatSheetArticles, searchText, selectedSeries, isFetching, hasMore, backgroundCurrentPage, qiitaUrls, ogpCache]);

    // ページネーション用のデータ（現在のページの記事のみ表示）
    const paginatedData = React.useMemo(() => {
        // 検索テキストがある場合、全件表示（ページネーションなし）
        if (searchText.trim()) {
            return filteredData;
        }

        if (selectedSeries === "チートシート") {
            // チートシートは全件表示（ページネーションなし）
            return filteredData;
        } else if (selectedSeries) {
            // シリーズ選択時：キャッシュから全記事を取得してフィルタリング
            const allCachedArticles: Ogp[] = [];
            const articlesCache = getArticlesCache();

            // キャッシュから全ページの記事を取得
            for (const [, cachedData] of Object.entries(articlesCache)) {
                if (isCacheValid(cachedData)) {
                    allCachedArticles.push(...cachedData.articles);
                }
            }

            // バックグラウンドで取得された記事も追加
            const allPagesArticles: Ogp[] = [];
            const sortedPages = Array.from(articlesByPage.keys()).sort((a, b) => a - b);
            sortedPages.forEach(page => {
                const pageArticles = articlesByPage.get(page) || [];
                allPagesArticles.push(...pageArticles);
            });

            // 重複を除外して結合
            const allArticlesMap = new Map<string, Ogp>();
            [...allCachedArticles, ...allPagesArticles].forEach(article => {
                if (!allArticlesMap.has(article.url)) {
                    allArticlesMap.set(article.url, article);
                }
            });

            // シリーズ名でフィルタリング
            const filterKeyword = getSeriesFilterKeyword(selectedSeries);
            const filtered = Array.from(allArticlesMap.values()).filter((ogpObj) => {
                const title = ogpObj.title || "";
                return title.includes(filterKeyword);
            });

            // 6件ずつページネーション
            const startIndex = (currentPage - 1) * itemsPerPage;
            return filtered.slice(startIndex, startIndex + itemsPerPage);
        } else {
            // シリーズ未選択の場合、現在のページの記事を直接取得
            const pageArticles = articlesByPage.get(currentPage) || [];
            return pageArticles;
        }
    }, [filteredData, currentPage, itemsPerPage, selectedSeries, articlesByPage, searchText]);

    // 総ページ数を計算
    const totalPages = React.useMemo(() => {
        // 検索テキストがある場合、全件表示するため、ページネーションは1ページのみ
        if (searchText.trim()) {
            return 1;
        }

        if (selectedSeries === "チートシート") {
            // チートシートは全件表示するため、ページネーションは1ページのみ
            return 1;
        } else if (selectedSeries) {
            // シリーズ選択時：キャッシュから全記事を取得してフィルタリング後の件数から計算
            const allCachedArticles: Ogp[] = [];
            const articlesCache = getArticlesCache();

            // キャッシュから全ページの記事を取得
            for (const [, cachedData] of Object.entries(articlesCache)) {
                if (isCacheValid(cachedData)) {
                    allCachedArticles.push(...cachedData.articles);
                }
            }

            // バックグラウンドで取得された記事も追加
            const allPagesArticles: Ogp[] = [];
            const sortedPages = Array.from(articlesByPage.keys()).sort((a, b) => a - b);
            sortedPages.forEach(page => {
                const pageArticles = articlesByPage.get(page) || [];
                allPagesArticles.push(...pageArticles);
            });

            // 重複を除外して結合
            const allArticlesMap = new Map<string, Ogp>();
            [...allCachedArticles, ...allPagesArticles].forEach(article => {
                if (!allArticlesMap.has(article.url)) {
                    allArticlesMap.set(article.url, article);
                }
            });

            // シリーズ名でフィルタリング
            const filterKeyword = getSeriesFilterKeyword(selectedSeries);
            const filtered = Array.from(allArticlesMap.values()).filter((ogpObj) => {
                const title = ogpObj.title || "";
                return title.includes(filterKeyword);
            });

            // 検索フィルタリング
            let finalFiltered = filtered;
            if (searchText.trim()) {
                const key = searchText.toLowerCase();
                finalFiltered = filtered.filter((ogpObj) => {
                    const title = (ogpObj.title || "").toLowerCase();
                    return title.includes(key);
                });
            }

            return Math.ceil(finalFiltered.length / itemsPerPage);
        } else {
            // シリーズ未選択の場合、取得済みのページ数を使用
            // 記事があるページのみをカウント（記事が0件のページは除外）
            const pagesWithArticles = Array.from(fetchedPages).filter(page => {
                const pageArticles = articlesByPage.get(page) || [];
                return pageArticles.length > 0;
            });
            const maxFetchedPage = pagesWithArticles.length > 0 ? Math.max(...pagesWithArticles) : 0;

            // 次ページ（currentPage + 1）に記事があるかチェック
            const nextPage = currentPage + 1;
            const nextPageArticles = articlesByPage.get(nextPage) || [];
            const nextPageHasArticles = fetchedPages.has(nextPage) ? nextPageArticles.length > 0 : false;

            // hasMoreがfalseの場合は、これ以上ページがないのでmaxFetchedPageを返す
            if (!hasMore) {
                // 記事がもうないので、実際に取得できた最大ページ数を返す（記事があるページのみ）
                return maxFetchedPage > 0 ? maxFetchedPage : Math.max(1, currentPage);
            } else {
                // 次ページが取得済みで記事がない場合、現在のページが最大ページ
                if (nextPageHasArticles === false && fetchedPages.has(nextPage)) {
                    return Math.max(maxFetchedPage, currentPage);
                }
                // まだ次のページがある可能性がある
                return Math.max(maxFetchedPage, currentPage) + 1;
            }
        }
    }, [itemsPerPage, selectedSeries, fetchedPages, currentPage, articlesByPage, searchText, hasMore]);


    // フィルター変更時にページをリセット（シリーズ選択時はキャッシュから取得するため、fetchedPagesはリセットしない）
    React.useEffect(() => {
        setCurrentPage(1);
        // シリーズ選択時はキャッシュから取得するため、fetchedPagesはリセットしない
        if (!selectedSeries) {
            setFetchedPages(new Set());
        }
    }, [selectedSeries, searchText]);

    // currentPageがtotalPagesを超えないようにする
    React.useEffect(() => {
        if (totalPages > 0 && currentPage > totalPages) {
            console.log(`[BlogPage] Adjusting currentPage from ${currentPage} to ${totalPages}`);
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    // ページ移動後に記事がない場合、前のページに戻す
    React.useEffect(() => {
        // シリーズ未選択時のみチェック（シリーズ選択時はpaginatedDataが空になることはない）
        if (!selectedSeries && !searchText.trim() && paginatedData.length === 0 && currentPage > 1) {
            console.log(`[BlogPage] No articles on page ${currentPage}, moving back to page ${currentPage - 1}`);
            setCurrentPage(currentPage - 1);
        }
    }, [paginatedData, currentPage, selectedSeries, searchText]);

    // 表示されている記事でOGPが不完全な場合、バックグラウンドで再取得
    React.useEffect(() => {
        if (paginatedData.length === 0) return;

        const incompleteUrls: string[] = [];
        paginatedData.forEach(article => {
            const hasImages = article.images && article.images.length > 0 && article.images[0];
            const hasTitle = article.title && article.title.trim() !== "";
            if (!hasImages || !hasTitle) {
                incompleteUrls.push(article.url);
            }
        });

        if (incompleteUrls.length > 0) {
            console.log(`[OGP] Found ${incompleteUrls.length} articles with incomplete OGP, retrying in background...`);
            // バックグラウンドで再取得（非同期で実行）
            fetchOgpWithLocalCache(incompleteUrls, true).catch(error => {
                console.error("[OGP] Error retrying incomplete OGP:", error);
            });
        }
    }, [paginatedData]);

    const handleSeriesClick = (series: string) => {
        setSelectedSeries(series);
        if (series !== "チートシート") {
            // Jotaiのデータを使用するため、特別な処理は不要
        }
    };

    const clearSeries = () => {
        setSelectedSeries("");
    };

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchText(e.target.value);
    };

    // 現在のページ情報をコンソールに出力（開発時のデバッグ用）
    React.useEffect(() => {
        if (process.env.NODE_ENV === 'development') {
            console.log(`Jotai URLs: ${qiitaUrls.length}, OGP Cache: ${Object.keys(ogpCache).length}`);
            console.log(`Cache stats - Local: ${cacheStats.localCacheSize}, Server: ${cacheStats.serverCacheSize}`);
        }
    }, [qiitaUrls.length, ogpCache, cacheStats]);

    const bgImages = ["/image.png", "/image2.png", "/image3.png"];

    return (
        <HeroBackground images={bgImages} intro={{ enabled: false }}>
            <BackgroundFetcher />
            <main className="mx-auto max-w-6xl px-4 py-10">
                <motion.div
                    key="header"
                    className="mb-8 text-center"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                >
                    <h1 className="text-3xl sm:text-4xl font-bold mb-2">
                        <span className="bg-gradient-to-r from-green-300 via-green-400 to-emerald-400 bg-clip-text text-transparent">
                            📝 Published Articles
                        </span>
                    </h1>
                </motion.div>

                {/* ナビゲーションボタン */}
                <motion.div
                    key="navigation"
                    className="flex flex-wrap gap-3 justify-center mb-6"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.1 }}
                >
                        <Link
                            href="/link"
                            className="group rounded-lg border border-white/10 bg-white/5 px-6 py-3 text-sm font-medium text-white hover:bg-white/10 transition-all duration-200 ring-1 ring-white/20 hover:ring-white/40 backdrop-blur"
                        >
                            <span className="flex items-center gap-2">
                                <span>←</span>
                                <span>リンク集に戻る</span>
                            </span>
                        </Link>
                        <Link
                            href="https://qiita.com/JavaLangRuntimeException"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group rounded-lg border border-green-500/30 bg-green-500/10 px-6 py-3 text-sm font-medium text-green-300 hover:bg-green-500/20 transition-all duration-200 ring-1 ring-green-500/20 hover:ring-green-500/40 backdrop-blur"
                        >
                            <span className="flex items-center gap-2">
                                <span>Qiitaプロフィールへ</span>
                                <span>→</span>
                            </span>
                        </Link>
                    </motion.div>

                {/* 検索バー */}
                <motion.div
                    key="search"
                    className="max-w-md mx-auto mb-6"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                >
                        <input
                            type="text"
                            value={searchText}
                            onChange={handleSearchChange}
                            placeholder="タイトル検索..."
                            className="w-full p-3 rounded-xl border border-white/10 bg-white/5 backdrop-blur text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500/50 transition-all"
                        />
                    </motion.div>

                {/* シリーズ選択ボタン群 */}
                <motion.div
                    key="series-buttons"
                    className="mb-6 flex flex-wrap gap-2 justify-center"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.3 }}
                >
                        {seriesList.map((series) => (
                            <button
                                key={series}
                                onClick={() => handleSeriesClick(series)}
                                className={
                                    series === selectedSeries
                                        ? "px-4 py-2 rounded-lg bg-green-500/20 text-green-300 border border-green-500/30 backdrop-blur transition-all duration-200 hover:bg-green-500/30"
                                        : "px-4 py-2 rounded-lg bg-white/5 text-white/90 border border-white/10 backdrop-blur transition-all duration-200 hover:bg-white/10 hover:border-white/20"
                                }
                            >
                                {series}
                            </button>
                        ))}
                        {selectedSeries && (
                            <button
                                onClick={clearSeries}
                                className="px-4 py-2 rounded-lg bg-red-500/20 text-red-300 border border-red-500/30 backdrop-blur transition-all duration-200 hover:bg-red-500/30"
                            >
                                Clear
                            </button>
                        )}
                    </motion.div>

                {/* シリーズボタンの下のページネーション（1ページ目から表示） */}
                {!selectedSeries && !searchText.trim() && !pageLoading && !loading && paginatedData.length > 0 && (
                    <motion.div
                        key="top-pagination"
                        className="mb-6 flex items-center justify-center gap-4"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.4 }}
                    >
                        <button
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                            className="px-4 py-2 rounded-lg bg-white/5 text-white border border-white/10 backdrop-blur transition-all duration-200 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            前へ
                        </button>

                        <span className="text-zinc-300">
                            {currentPage} / {totalPages}
                        </span>

                        <button
                            onClick={() => {
                                const nextPage = currentPage + 1;
                                // totalPagesを超えないようにする
                                if (nextPage <= totalPages) {
                                    // シリーズ未選択時は、次ページに記事があるかチェック
                                    if (!selectedSeries) {
                                        const nextPageArticles = articlesByPage.get(nextPage) || [];
                                        // 次ページが取得済みで記事がない場合、移動しない
                                        if (fetchedPages.has(nextPage) && nextPageArticles.length === 0) {
                                            console.log(`[BlogPage] Next page ${nextPage} has no articles, not moving`);
                                            return;
                                        }
                                        // 次ページが未取得でhasMoreがfalseの場合、移動しない
                                        if (!fetchedPages.has(nextPage) && !hasMore) {
                                            console.log(`[BlogPage] No more articles available, not moving to page ${nextPage}`);
                                            return;
                                        }
                                    }
                                    setCurrentPage(nextPage);
                                }
                            }}
                            disabled={(() => {
                                // 検索テキストがある場合は常に無効（全件表示のため）
                                if (searchText.trim()) {
                                    return true;
                                }

                                // チートシートの場合は常に無効（全件表示のため）
                                if (selectedSeries === "チートシート") {
                                    return true;
                                }

                                // シリーズ未選択時は、次ページに記事があるか直接チェック
                                if (!selectedSeries) {
                                    const nextPage = currentPage + 1;
                                    const nextPageArticles = articlesByPage.get(nextPage) || [];

                                    // 次ページが取得済みで記事がない場合
                                    if (fetchedPages.has(nextPage)) {
                                        return nextPageArticles.length === 0;
                                    }

                                    // 次ページが未取得でhasMoreがfalseの場合
                                    if (!hasMore) {
                                        return true;
                                    }

                                    // 次ページが未取得でhasMoreがtrueの場合でも、totalPagesを超える場合は無効
                                    if (currentPage >= totalPages) {
                                        return true;
                                    }

                                    return false;
                                }

                                // シリーズ選択時は、フィルター後のデータから次ページの記事数をチェック
                                if (selectedSeries) {
                                    const allCachedArticles: Ogp[] = [];
                                    const articlesCache = getArticlesCache();

                                    for (const [, cachedData] of Object.entries(articlesCache)) {
                                        if (isCacheValid(cachedData)) {
                                            allCachedArticles.push(...cachedData.articles);
                                        }
                                    }

                                    const allPagesArticles: Ogp[] = [];
                                    const sortedPages = Array.from(articlesByPage.keys()).sort((a, b) => a - b);
                                    sortedPages.forEach(page => {
                                        const pageArticles = articlesByPage.get(page) || [];
                                        allPagesArticles.push(...pageArticles);
                                    });

                                    const allArticlesMap = new Map<string, Ogp>();
                                    [...allCachedArticles, ...allPagesArticles].forEach(article => {
                                        if (!allArticlesMap.has(article.url)) {
                                            allArticlesMap.set(article.url, article);
                                        }
                                    });

                                    const filterKeyword = getSeriesFilterKeyword(selectedSeries);
                                    const filtered = Array.from(allArticlesMap.values()).filter((ogpObj) => {
                                        const title = ogpObj.title || "";
                                        return title.includes(filterKeyword);
                                    });

                                    let finalFiltered = filtered;
                                    if (searchText.trim()) {
                                        const key = searchText.toLowerCase();
                                        finalFiltered = filtered.filter((ogpObj) => {
                                            const title = (ogpObj.title || "").toLowerCase();
                                            return title.includes(key);
                                        });
                                    }

                                    const nextPage = currentPage + 1;
                                    const startIndex = (nextPage - 1) * itemsPerPage;
                                    const nextPageData = finalFiltered.slice(startIndex, startIndex + itemsPerPage);
                                    return nextPageData.length === 0;
                                }

                                return false;
                            })()}
                            className="px-4 py-2 rounded-lg bg-green-500/20 text-green-300 border border-green-500/30 backdrop-blur transition-all duration-200 hover:bg-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            次へ
                        </button>
                    </motion.div>
                )}

                {/* 記事取得中のアニメーション */}
                {pageLoading && (
                    <motion.div
                        key="loading-articles"
                        className="text-center mt-8"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                    >
                        <div className="inline-flex items-center justify-center gap-3">
                            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-400"></div>
                            <p className="text-sm text-zinc-400">記事取得中...</p>
                        </div>
                    </motion.div>
                )}

                {/* 記事一覧 */}
                {paginatedData.some(article => article.title && article.title.trim() !== "") && (
                    <div className={`grid gap-6 ${selectedSeries === "チートシート" ? "sm:grid-cols-1" : "sm:grid-cols-1 lg:grid-cols-2"}`}>
                        {paginatedData
                            .filter((ogp, idx, array) => {
                                    // タイトルが取得できていない記事は表示しない
                                    if (!ogp.title || ogp.title.trim() === '') {
                                        return false;
                                    }

                                    // 有効なURLチェック
                                    if (!ogp.url || ogp.url.trim() === '') {
                                        console.warn(`[Filtering] Removing item with invalid URL at index ${idx}:`, ogp);
                                        return false;
                                    }

                                    // URLで重複を除去（最初の出現のみ保持）
                                    const firstIndex = array.findIndex(item => item.url === ogp.url);
                                    if (firstIndex !== idx) {
                                        console.warn(`[Filtering] Removing duplicate URL at index ${idx}:`, ogp.url);
                                        return false;
                                    }

                                    return true;
                                })
                                .map((ogp, idx) => {
                                    const { title, description, url, images, tags } = ogp;
                                    const imgidx = images?.[0];

                                    // より堅牢なキー生成：URLハッシュ + インデックス + シリーズ
                                    const urlHash = url ? (url.split('/').pop() || url.replace(/[^a-zA-Z0-9]/g, '') || 'unknown') : 'empty';
                                    const seriesKey = selectedSeries || 'all';
                                    const safeUrlHash = urlHash || 'fallback';
                                    const uniqueKey = `article-${seriesKey}-${safeUrlHash}-${idx}-${url?.length || 0}`;

                                    // キーが空文字列になることを防ぐ最終チェック
                                    if (!uniqueKey || uniqueKey.trim() === '') {
                                        console.error(`[KeyError] Generated empty key for item ${idx}:`, { url, seriesKey, urlHash });
                                        return null; // 空キーの場合はコンポーネントをレンダリングしない
                                    }

                                    if (process.env.NODE_ENV === 'development') {
                                        console.log(`Rendering item ${idx}:`, {
                                            title: title || '(No title)',
                                            url,
                                            hasImages: !!imgidx,
                                            uniqueKey
                                        });
                                    }

                                    return (
                                        <motion.a
                                            key={uniqueKey}
                                            href={url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="group relative rounded-xl border border-white/20 bg-white/10 p-8 backdrop-blur transition-all duration-300 hover:bg-white/15 hover:scale-105 hover:shadow-xl hover:shadow-green-500/20 hover:border-green-500/30"
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: idx * 0.1, duration: 0.5 }}
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                        >
                                            {/* OGP画像をカード上部に表示 */}
                                            {imgidx && (
                                                <div className="mb-4 rounded-lg overflow-hidden border border-white/10 shadow-lg">
                                                    <Image
                                                        src={imgidx}
                                                        alt={title || "Qiita 記事一覧"}
                                                        className="w-full h-56 object-cover group-hover:scale-105 transition-transform duration-300"
                                                        width={800}
                                                        height={320}
                                                        loading="lazy"
                                                        placeholder="blur"
                                                        blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDABQODxIPDRQSEBIXFRQdHx4eHRoaHSQtJSEkLzYvLy02LjY2OjY2Njo2NjY2NjY2NjY2NjY2NjY2NjY2NjY2Njb/2wBDAR0XFx8aHx4fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx//wAARCAAIAAoDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k="
                                                    />
                                                </div>
                                            )}
                                            <div className="flex items-start gap-3 mb-3">
                                                <div className="w-2 h-2 mt-2 rounded-full bg-green-400 animate-pulse flex-shrink-0"/>
                                                <h2 className="text-xl font-semibold text-white group-hover:text-green-300 transition-colors line-clamp-2">
                                                    {title}
                                                </h2>
                                            </div>
                                            {description && (
                                                <p className="text-sm text-zinc-300/90 line-clamp-4 mb-4">
                                                    {description}
                                                </p>
                                            )}

                                            {/* タグ表示 */}
                                            {tags && tags.length > 0 && (
                                                <div className="flex flex-wrap gap-2 mb-4">
                                                    {tags.slice(0, 8).map((tag, tagIdx) => (
                                                        <span
                                                            key={`${uniqueKey}-tag-${tagIdx}`}
                                                            className="px-3 py-1 text-xs rounded-full bg-green-500/20 text-green-300 border border-green-500/30"
                                                        >
                                                            {tag}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}

                                            <div className="mt-4 flex items-center text-green-400 group-hover:text-green-300 transition-colors">
                                                <span className="text-sm font-semibold">記事を読む</span>
                                                <motion.span
                                                    className="ml-2"
                                                    animate={{x: [0, 5, 0]}}
                                                    transition={{duration: 1.5, repeat: Infinity}}
                                                >
                                                    →
                                                </motion.span>
                                            </div>
                                        </motion.a>
                                    );
                                })
                                .filter(Boolean)}
                        </div>
                    )}

                {loading && filteredData.length === 0 && (
                    <motion.div
                        key="loading-initial"
                        className="text-center mt-8"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                    >
                        <div className="inline-flex items-center justify-center gap-3">
                            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-400"></div>
                            <p className="text-sm text-zinc-400">記事を読み込み中...</p>
                        </div>
                    </motion.div>
                )}

                {isFetching && (
                    <motion.div
                        key="fetching-background"
                        className="text-center mt-8"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                    >
                        <div className="inline-flex items-center justify-center gap-2">
                            <div className="animate-pulse bg-green-400 rounded-full h-3 w-3"></div>
                            <span className="text-sm text-zinc-400">バックグラウンドで記事を取得中...</span>
                        </div>
                    </motion.div>
                )}

            </main>
        </HeroBackground>
    );
}
