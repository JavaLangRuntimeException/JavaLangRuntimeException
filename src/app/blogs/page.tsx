"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { atom, useAtom } from "jotai";
import { fetchQiitaURLs, fetchMultipleOgp, getCacheStats, type OGPResponse } from "./server";
import Link from "next/link";
import Image from 'next/image';
import { useInView } from 'react-intersection-observer';

const searchAtom = atom("");

interface Ogp {
    title: string;
    description: string;
    url: string;
    images?: string[];
}

// ローカルストレージキャッシュの設定
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
    const results: Ogp[] = [];
    const urlsToFetch: string[] = [];

    // 既存キャッシュをチェック
    for (const url of urls) {
        const cachedData = cache[url];
        if (cachedData && isCacheValid(cachedData)) {
            // キャッシュから復元
            results.push({
                title: cachedData.data.title || "",
                description: cachedData.data.description || "",
                url: cachedData.data.url || url,
                images: cachedData.data.images || []
            });
        } else {
            // 新規取得が必要
            urlsToFetch.push(url);
            results.push({
                title: "",
                description: "",
                url: "",
                images: []
            }); // プレースホルダー
        }
    }

    // 新規取得が必要なURLがある場合
    if (urlsToFetch.length > 0) {
        console.log(`Fetching ${urlsToFetch.length} new OGP data entries from server`);

        try {
            const newOgpData = await fetchMultipleOgp(urlsToFetch);

            // 結果をマージし、キャッシュに保存
            const updatedCache = { ...cache };
            let fetchIndex = 0;

            for (let i = 0; i < urls.length; i++) {
                const url = urls[i];
                const cachedData = cache[url];

                if (!cachedData || !isCacheValid(cachedData)) {
                    const ogpData = newOgpData[fetchIndex];
                    results[i] = {
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

                    fetchIndex++;
                }
            }

            saveToLocalStorage(updatedCache);
        } catch (error) {
            console.error("Error fetching OGP data:", error);
        }
    }

    return results;
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
    const [currentPage, setCurrentPage] = React.useState(1);
    const [hasMore, setHasMore] = React.useState(true);
    const [cacheStats, setCacheStats] = React.useState<{
        localCacheSize: number;
        serverCacheSize: number;
    }>({ localCacheSize: 0, serverCacheSize: 0 });
    const { ref, inView } = useInView();

    const fetchedUrls = React.useRef<Set<string>>(new Set());

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

    // チートシートのOGPデータを取得（ローカルキャッシュ活用）
    const fetchCheatSheetOgp = React.useCallback(async () => {
        if (cheatSheetArticles.length > 0) return; // 既に取得済みの場合はスキップ

        try {
            setLoading(true);
            const urls = cheatSheetData.map(item => item.url);
            const ogpResults = await fetchOgpWithLocalCache(urls);

            // フォールバック処理：OGPデータが取得できない場合は元のタイトルを使用
            const finalResults = ogpResults.map((ogp, index) => ({
                title: ogp.title || cheatSheetData[index].title,
                description: ogp.description || "",
                url: ogp.url || cheatSheetData[index].url,
                images: ogp.images || []
            }));

            setCheatSheetArticles(finalResults);
        } catch (error) {
            console.error("Error fetching cheat sheet articles:", error);
        } finally {
            setLoading(false);
        }
    }, [cheatSheetArticles.length]);

    const fetchArticles = React.useCallback(async (page: number, shouldAppend: boolean) => {
        if (loading || !hasMore) return;

        try {
            setLoading(true);
            const urls = await fetchQiitaURLs(page, page === 1);

            if (urls.length === 0) {
                setHasMore(false);
                return;
            }

            const newUrls = urls.filter((url) => !fetchedUrls.current.has(url));
            newUrls.forEach((url) => fetchedUrls.current.add(url));

            // ローカルキャッシュを活用してOGP情報を取得
            const ogpResults = await fetchOgpWithLocalCache(newUrls);

            setArticles((prev) =>
                shouldAppend ? [...prev, ...ogpResults] : ogpResults
            );
        } catch (error) {
            console.error("Error fetching articles:", error);
            setHasMore(false);
        } finally {
            setLoading(false);
        }
    }, [loading, hasMore]);

    React.useEffect(() => {
        if (selectedSeries === "チートシート") {
            fetchCheatSheetOgp();
        } else {
            fetchArticles(1, false);
        }
    }, [selectedSeries, fetchCheatSheetOgp, fetchArticles]);

    React.useEffect(() => {
        if (inView && hasMore && !loading && selectedSeries !== "チートシート") {
            setCurrentPage((prev) => {
                const nextPage = prev + 1;
                fetchArticles(nextPage, true);
                return nextPage;
            });
        }
    }, [inView, hasMore, loading, fetchArticles, selectedSeries]);

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

        return filtered;
    }, [articles, cheatSheetArticles, searchText, selectedSeries]);

    const handleSeriesClick = (series: string) => {
        setSelectedSeries(series);
        setCurrentPage(1); // currentPageを使用
        setHasMore(true);
        fetchedUrls.current.clear();
        if (series !== "チートシート") {
            setArticles([]); // チートシート以外の場合は記事リストをリセット
        }
    };

    const clearSeries = () => {
        setSelectedSeries("");
        setCurrentPage(1); // currentPageを使用
        setHasMore(true);
        fetchedUrls.current.clear();
        setArticles([]);
    };

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchText(e.target.value);
    };

    // 現在のページ情報をコンソールに出力（開発時のデバッグ用）
    React.useEffect(() => {
        if (process.env.NODE_ENV === 'development') {
            console.log(`Current page: ${currentPage}, Selected series: ${selectedSeries}`);
            console.log(`Cache stats - Local: ${cacheStats.localCacheSize}, Server: ${cacheStats.serverCacheSize}`);
        }
    }, [currentPage, selectedSeries, cacheStats]);

    return (
        <main className="p-4">
            <AnimatePresence mode="wait">
                <motion.div className="mb-6 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <h1 className="text-xl font-bold">Qiita 記事一覧</h1>
                    {process.env.NODE_ENV === 'development' && (
                        <p className="text-sm text-gray-500 mt-2">
                            キャッシュ: ローカル{cacheStats.localCacheSize}件 / サーバー{cacheStats.serverCacheSize}件
                        </p>
                    )}
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
                    {filteredData.map((ogp, idx) => {
                        const { title, description, url, images } = ogp;
                        const imgidx = images?.[0];
                        if (!url) return null;

                        return (
                            <motion.a
                                key={`${selectedSeries}-${url}-${idx}-${title?.slice(0, 10)}`}
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
                                        blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDABQODxIPDRQSEBIXFRQdHx4eHRoaHSQtJSEkLzYvLy02LjY2OjY2Njo2NjY2NjY2NjY2NjY2NjY2NjY2NjY2Njb/2wBDAR0XFx8aHx4fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx//wAARCAAIAAoDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k="
                                    />
                                )}
                                <h2 className="font-bold text-lg mb-1">{title}</h2>
                                <p className="text-sm line-clamp-3">{description}</p>
                            </motion.a>
                        );
                    })}
                </div>

                {loading && (
                    <div className="text-center mt-6">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                        <p className="mt-2">記事を読み込み中...</p>
                    </div>
                )}

                {!loading && hasMore && selectedSeries !== "チートシート" && (
                    <div ref={ref} className="h-10 w-full" />
                )}

                {!hasMore && selectedSeries !== "チートシート" && (
                    <div className="text-center mt-6 text-gray-500">
                        すべての記事を読み込みました
                    </div>
                )}
            </AnimatePresence>
        </main>
    );
}
