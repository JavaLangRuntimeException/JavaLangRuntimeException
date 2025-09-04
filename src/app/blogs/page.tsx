"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { atom, useAtom } from "jotai";
import { qiitaUrlsAtom, ogpCacheAtom, isFetchingAtom, hasMoreAtom, currentPageAtom } from "../../components/BackgroundFetcher";
import dynamic from "next/dynamic";
const BackgroundFetcher = dynamic(() => import("../../components/BackgroundFetcher").then(m => m.BackgroundFetcher), { ssr: false });
import { fetchMultipleOgp, getCacheStats, type OGPResponse } from "./server";
import Link from "next/link";
import Image from 'next/image';

const searchAtom = atom("");

interface Ogp {
    title: string;
    description: string;
    url: string;
    images?: string[];
}

// ローカルストレージキャッシュの設定（既存のOGP取得用）
const LOCAL_STORAGE_KEY = 'taramanji_qiita_ogp_cache';
const CACHE_DURATION = 365 * 24 * 60 * 60 * 1000; // 1年間（ミリ秒）

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
function isCacheValid(cachedData: CachedOgpData): boolean {
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
 * 複数URLのOGP情報を効率的に取得（ローカルキャッシュ活用）
 */
async function fetchOgpWithLocalCache(urls: string[]): Promise<Ogp[]> {
    const cache = getLocalStorageCache();
    const results: (Ogp | null)[] = [];
    const urlsToFetch: { url: string; index: number }[] = [];

    // 既存キャッシュをチェック
    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        const cachedData = cache[url];
        if (cachedData && isCacheValid(cachedData)) {
            // キャッシュから復元
            results[i] = {
                title: cachedData.data.title || "",
                description: cachedData.data.description || "",
                url: cachedData.data.url || url,
                images: cachedData.data.images || []
            };
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

                results[index] = {
                    title: ogpData.title || "",
                    description: ogpData.description || "",
                    url: ogpData.url || url,
                    images: ogpData.images || []
                };

                // ローカルキャッシュに保存
                updatedCache[url] = {
                    data: ogpData,
                    timestamp: Date.now()
                };
            }

            saveToLocalStorage(updatedCache);
        } catch (error) {
            console.error("Error fetching OGP data:", error);

            // エラー時はフォールバック値を設定
            for (const { url, index } of urlsToFetch) {
                if (results[index] === null) {
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

    // nullの要素を除外してOgp[]として返す
    return results.filter((result): result is Ogp => result !== null);
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
    "情報処理技術者試験合格への道[IP・SG・FE・AP]",
    "IAM AWS User クラウドサービスをフル活用しよう！",
    "Project Gopher: Unlocking Go's Secrets",
];

export default function BlogsPage() {
    const [searchText, setSearchText] = useAtom(searchAtom);
    const [loading, setLoading] = React.useState(false);
    const [selectedSeries, setSelectedSeries] = React.useState("");
    const [articles, setArticles] = React.useState<Ogp[]>([]);
    const [cheatSheetArticles, setCheatSheetArticles] = React.useState<Ogp[]>([]);
    const [cacheStats, setCacheStats] = React.useState<{
        localCacheSize: number;
        serverCacheSize: number;
    }>({ localCacheSize: 0, serverCacheSize: 0 });

    // グローバル状態から取得
    const qiitaUrls = useAtom(qiitaUrlsAtom)[0];
    const ogpCache = useAtom(ogpCacheAtom)[0];
    const isFetching = useAtom(isFetchingAtom)[0];
    const hasMore = useAtom(hasMoreAtom)[0];
    const currentPage = useAtom(currentPageAtom)[0];

    // デバッグ情報を表示
    React.useEffect(() => {
        console.log(`[BlogPage] State update: URLs=${qiitaUrls.length}, OGP=${Object.keys(ogpCache).length}, fetching=${isFetching}, hasMore=${hasMore}, page=${currentPage}`);
        console.log(`[BlogPage] Selected series: "${selectedSeries}"`);
    }, [qiitaUrls.length, Object.keys(ogpCache).length, isFetching, hasMore, currentPage, selectedSeries]);

    // 開発環境での強制初期化
    React.useEffect(() => {
        if (process.env.NODE_ENV === 'development') {
            // 初期状態を強制設定
            if (selectedSeries === "チートシート") {
                console.log('[BlogPage] Force clearing selectedSeries in development');
                setSelectedSeries("");
            }
        }
    }, [selectedSeries]);

    // 初期化時にキャッシュクリーンアップを実行
    React.useEffect(() => {
        cleanupExpiredLocalCache();

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

        // 開発用：キャッシュをクリアする関数
    const clearAllCache = React.useCallback(() => {
        // localStorage をクリア
        localStorage.removeItem('taramanji_qiita_urls');
        localStorage.removeItem('taramanji_ogp_cache');
        localStorage.removeItem('taramanji_last_fetch');
        localStorage.removeItem('taramanji_current_page');
        localStorage.removeItem('taramanji_has_more');
        localStorage.removeItem('taramanji_is_fetching');
        localStorage.removeItem(LOCAL_STORAGE_KEY);

        // Cookie をクリア
        document.cookie = 'taramanji_qiita_urls=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        document.cookie = 'taramanji_ogp_cache=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';

        // 状態をリセット（ページリロードが必要）
        console.log('All cache cleared. Please reload the page.');
        window.location.reload();
    }, []);

        // チートシートのOGPデータを取得（ローカルキャッシュ活用）
    const fetchCheatSheetOgp = React.useCallback(async () => {
        if (cheatSheetArticles.length > 0) {
            console.log('[fetchCheatSheetOgp] Already loaded, skipping');
            return; // 既に取得済みの場合はスキップ
        }

        try {
            setLoading(true);
            console.log("Fetching cheat sheet OGP data...");
            const urls = cheatSheetData.map(item => item.url);
            const ogpResults = await fetchOgpWithLocalCache(urls);

            // フォールバック処理：OGPデータが取得できない場合は元のタイトルを使用
            const finalResults = ogpResults.map((ogp, index) => ({
                title: ogp.title || cheatSheetData[index].title,
                description: ogp.description || "",
                url: ogp.url || cheatSheetData[index].url,
                images: ogp.images || []
            }));

            console.log(`Cheat sheet articles loaded: ${finalResults.length} items`);
            setCheatSheetArticles(finalResults);
        } catch (error) {
            console.error("Error fetching cheat sheet articles:", error);
            // エラー時はフォールバック：最低限のデータで表示
            const fallbackResults = cheatSheetData.map(item => ({
                title: item.title,
                description: "",
                url: item.url,
                images: []
            }));
            setCheatSheetArticles(fallbackResults);
        } finally {
            setLoading(false);
        }
    }, [cheatSheetArticles.length]);

    // 手動でQiita記事をfetchする関数（バックグラウンドfetchが動かない場合の対策）
    const manualFetchQiitaArticles = React.useCallback(async () => {
        if (isFetching || qiitaUrls.length > 0) return; // 既にfetch中または取得済み

        try {
            setLoading(true);
            console.log("Manual fetch of Qiita articles...");

            const { fetchQiitaURLs } = await import("./server");
            const urls = await fetchQiitaURLs(1, true);

            if (urls.length > 0) {
                console.log(`Manual fetch got ${urls.length} URLs`);
                const ogpResults = await fetchOgpWithLocalCache(urls);

                const articlesData = ogpResults.map((ogp, index) => ({
                    title: ogp.title || "",
                    description: ogp.description || "",
                    url: ogp.url || urls[index],
                    images: ogp.images || []
                }));

                setArticles(articlesData);
                console.log(`Manual fetch completed: ${articlesData.length} articles`);
            }
        } catch (error) {
            console.error("Manual fetch error:", error);
        } finally {
            setLoading(false);
        }
    }, [isFetching, qiitaUrls.length]);

    // Jotaiから記事データを構築（非チートシートのみ）
    React.useEffect(() => {
        if (selectedSeries !== "チートシート" && qiitaUrls.length > 0) {
            console.log(`[BlogPage] Building articles from Jotai data: ${qiitaUrls.length} URLs`);

            const articlesFromJotai = qiitaUrls.map(url => {
                const cachedOgp = ogpCache[url];
                return cachedOgp || {
                    title: "",
                    description: "",
                    url: url,
                    images: []
                };
            }).filter(article => article.url); // URLが存在する記事のみ

            setArticles(articlesFromJotai);
            console.log(`[BlogPage] Set ${articlesFromJotai.length} articles from Jotai cache`);
        } else if (selectedSeries !== "チートシート" && qiitaUrls.length === 0) {
            // バックグラウンドfetchが動作していない場合は手動fetch
            console.log("No Jotai data found, attempting manual fetch...");
            manualFetchQiitaArticles();
        }
    }, [selectedSeries, qiitaUrls, ogpCache, manualFetchQiitaArticles]);

    // チートシート選択時の処理
    React.useEffect(() => {
        console.log(`useEffect triggered: selectedSeries="${selectedSeries}"`);
        if (selectedSeries === "チートシート") {
            console.log(`[BlogPage] Cheat sheet selected, using static data (17 items)`);
            fetchCheatSheetOgp();
        }
    }, [selectedSeries, fetchCheatSheetOgp]);

    const filteredData = React.useMemo(() => {
        let filtered: Ogp[] = [];

        if (selectedSeries === "チートシート") {
            filtered = cheatSheetArticles;
        } else {
            filtered = articles;

            if (selectedSeries) {
                filtered = filtered.filter((ogpObj) => {
                    const title = ogpObj.title || "";
                    return title.includes(selectedSeries);
                });
            }
        }

        if (searchText.trim()) {
            const key = searchText.toLowerCase();
            filtered = filtered.filter((ogpObj) => {
                const title = (ogpObj.title || "").toLowerCase();
                return title.includes(key);
            });
        }

        console.log(`Filtered data for rendering:`, filtered);
        console.log(`Selected series: "${selectedSeries}", Articles count: ${articles.length}, CheatSheet count: ${cheatSheetArticles.length}`);
        console.log(`Background fetch status: fetching=${isFetching}, hasMore=${hasMore}, currentPage=${currentPage}`);

        return filtered;
    }, [articles, cheatSheetArticles, searchText, selectedSeries, isFetching, hasMore, currentPage]);

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

    // 開発用：APIテスト機能
    const testQiitaAPI = React.useCallback(async () => {
        try {
            console.log('[API Test] Testing Qiita API connection...');
            const { fetchQiitaURLs } = await import("./server");
            const urls = await fetchQiitaURLs(1, true);
            console.log(`[API Test] Result: ${urls.length} URLs fetched`);
            alert(`API Test Result: ${urls.length} URLs fetched. Check console for details.`);
        } catch (error) {
            console.error('[API Test] Error:', error);
            alert(`API Test Failed: ${error}. Check console for details.`);
        }
    }, []);

    // 開発用：ページ数リセット機能
    const resetPageCounter = React.useCallback(() => {
        localStorage.removeItem('taramanji_current_page');
        localStorage.removeItem('taramanji_has_more');
        console.log('[Debug] Page counter reset. Please reload the page.');
        alert('Page counter reset. Please reload the page.');
    }, []);

    return (
        <main className="p-4">
            <BackgroundFetcher />
            <AnimatePresence>
                <motion.div className="mb-6 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <h1 className="text-xl font-bold">Qiita 記事一覧</h1>
                    {/* Debug panel removed for production design */}
                </motion.div>

                {/* ルートへのリンクボタン */}
                <div className="text-center mb-4">
                    <Link href="/" className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
                        リンク集に戻る
                    </Link>
                </div>

                {/* Qiitaへのリンクボタン */}
                <div className="text-center mb-4">
                    <Link href="https://qiita.com/JavaLangRuntimeException" target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600">
                        Qiitaプロフィールへ
                    </Link>
                </div>

                {/* 検索バー */}
                <div className="max-w-md mx-auto mb-4">
                    <input
                        type="text"
                        value={searchText}
                        onChange={handleSearchChange}
                        placeholder="タイトル検索..."
                        className="w-full p-2 border border-gray-300 rounded"
                    />
                </div>

                {/* シリーズ選択ボタン群 */}
                <div className="mb-4 flex flex-wrap gap-2 justify-center">
                    {seriesList.map((series) => (
                        <button
                            key={series}
                            onClick={() => handleSeriesClick(series)}
                            className={
                                series === selectedSeries
                                    ? "px-3 py-1 bg-blue-500 text-white rounded"
                                    : "px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                            }
                        >
                            {series}
                        </button>
                    ))}
                    {selectedSeries && (
                        <button onClick={clearSeries} className="px-3 py-1 bg-red-500 text-white rounded">
                            Clear
                        </button>
                    )}
                </div>

                {/* 記事一覧 */}
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 max-w-7xl mx-auto">
                    {filteredData
                        .filter((ogp, idx, array) => {
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
                            const { title, description, url, images } = ogp;
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
                                    className="block bg-gray-800 text-white rounded p-4 hover:opacity-90"
                                    initial={{ opacity: 0, y: 30 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                >
                                    {imgidx && (
                                        <Image
                                            src={imgidx}
                                            alt={title || "Qiita 記事一覧"}
                                            className="w-full h-40 object-cover mb-2"
                                            width={500}
                                            height={250}
                                            loading="lazy"
                                            placeholder="blur"
                                            blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDABQODxIPDRQSEBIXFRQdHx4eHRoaHSQtJSEkLzYvLy02LjY2OjY2Njo2NjY2NjY2NjY2NjY2NjY2NjY2NjY2Njb/2wBDAR0XFx8aHx4fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx//wAARCAAIAAoDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k="
                                        />
                                    )}
                                    <h2 className="font-bold text-lg mb-1">{title || "タイトル取得中..."}</h2>
                                    <p className="text-sm line-clamp-3">{description || "説明文を取得中..."}</p>
                                </motion.a>
                            );
                        })
                        .filter(Boolean)}
                </div>

                {loading && (
                    <div className="text-center mt-6">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                        <p className="mt-2">記事を読み込み中...</p>
                    </div>
                )}

                {isFetching && (
                    <div className="text-center mt-6">
                        <div className="inline-block animate-pulse bg-blue-500 rounded-full h-3 w-3 mr-2"></div>
                        <span className="text-sm text-gray-500">バックグラウンドで記事を取得中...</span>
                    </div>
                )}

                {!hasMore && (
                    <div className="text-center mt-6 text-gray-500">
                        すべての記事を読み込みました
                    </div>
                )}
            </AnimatePresence>
        </main>
    );
}
