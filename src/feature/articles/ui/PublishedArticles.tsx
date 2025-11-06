"use client";

import React, {useEffect, useState} from "react";
import {motion} from "framer-motion";
import {useAtom} from "jotai";
import {publishedArticlesAtom, publishedArticlesLastFetchAtom} from "../../../components/BackgroundFetcher";

interface Ogp {
    title: string;
    description: string;
    url: string;
    images?: string[];
    tags?: string[];
}

export const PublishedArticles: React.FC<{ showAnimations?: boolean; delay?: number }> = ({
                                                                                              showAnimations = true,
                                                                                              delay = 0
                                                                                          }) => {
    const [globalArticles, setGlobalArticles] = useAtom(publishedArticlesAtom);
    const [globalLastFetch, setGlobalLastFetch] = useAtom(publishedArticlesLastFetchAtom);
    const [pickupArticles, setPickupArticles] = useState<Ogp[]>(globalArticles?.pickupArticles || []);
    const [latestArticlesFromScrape, setLatestArticlesFromScrape] = useState<Ogp[]>(globalArticles?.latestArticlesFromScrape || []);
    const [latestArticles, setLatestArticles] = useState<Ogp[]>(globalArticles?.latestArticles || []);
    const [loading, setLoading] = useState(!globalArticles);

    useEffect(() => {
        // グローバル状態からデータを取得
        if (globalArticles) {
            console.log('[PublishedArticles] Loading from global state:', {
                pickupCount: globalArticles.pickupArticles.length,
                latestFromScrapeCount: globalArticles.latestArticlesFromScrape?.length || 0,
                latestCount: globalArticles.latestArticles.length,
                latestArticles: globalArticles.latestArticles
            });
            setPickupArticles(globalArticles.pickupArticles);
            setLatestArticlesFromScrape(globalArticles.latestArticlesFromScrape || []);
            setLatestArticles(globalArticles.latestArticles);
            setLoading(false);
        }

        let cancelled = false;
        async function fetchFresh() {
            try {
                setLoading(true);

                // ピックアップ記事とスクレイピングで取得したLatest Articlesはスクレイピングから取得
                const scrapeRes = await fetch(`/api/qiita-scrape?t=${Date.now()}`, { cache: "no-store" });
                const scrapeJson: {
                    pickupArticles?: Array<{ url: string; title: string; tags: string[] }>;
                    latestArticles?: Array<{ url: string; title: string; tags: string[] }>;
                } = await scrapeRes.json();

                const pickupItems = scrapeJson?.pickupArticles || [];
                const latestItemsFromScrape = scrapeJson?.latestArticles || [];

                // LatestArticlesはQiitaAPIから取得（ピックアップ記事と重複しない最新3件）
                // 重複を考慮して多めに取得（最大10件取得してからフィルタリング）
                const qiitaApiRes = await fetch(`/api/qiita?page=1&includeTags=1&perPage=10`, { cache: "no-store" });
                const qiitaApiJson: {
                    items?: Array<{
                        url: string;
                        title: string;
                        body?: string;
                        tags: Array<{ name: string }>
                    }>
                } = await qiitaApiRes.json();

                console.log('[PublishedArticles] QiitaAPI response:', qiitaApiJson?.items?.length || 0, 'items');

                // ピックアップ記事とスクレイピングで取得したLatest ArticlesのURLを取得（重複除外用）
                const pickupUrlsSet = new Set(pickupItems.map(item => item.url));
                const scrapeLatestUrlsSet = new Set(latestItemsFromScrape.map(item => item.url));
                const allExcludedUrlsSet = new Set([...pickupUrlsSet, ...scrapeLatestUrlsSet]);
                console.log('[PublishedArticles] Pickup URLs:', Array.from(pickupUrlsSet));
                console.log('[PublishedArticles] Scrape Latest URLs:', Array.from(scrapeLatestUrlsSet));

                // ピックアップ記事とスクレイピングLatest Articlesと重複しない最新記事を取得（最大3件）
                const allApiItems = qiitaApiJson?.items || [];
                const filteredItems = allApiItems.filter(item => !allExcludedUrlsSet.has(item.url));
                console.log('[PublishedArticles] Filtered items (after removing pickup and scrape latest duplicates):', filteredItems.length);

                const latestItems = filteredItems
                    .slice(0, 3) // 最大3件
                    .map(item => ({
                        url: item.url,
                        title: item.title,
                        tags: item.tags.map(tag => tag.name)
                    }));

                console.log('[PublishedArticles] Latest items from QiitaAPI:', latestItems);
                console.log('[PublishedArticles] Latest items count:', latestItems.length);
                console.log('[PublishedArticles] Pickup items:', pickupItems);
                console.log('[PublishedArticles] Latest items from scrape:', latestItemsFromScrape);

                const allItems = [...pickupItems, ...latestItemsFromScrape, ...latestItems];

                if (allItems.length === 0) {
                    if (!cancelled) {
                        setPickupArticles([]);
                        setLatestArticlesFromScrape([]);
                        setLatestArticles([]);
                    }
                    return;
                }

                // OGP取得なしで、直接記事データを作成
                const createArticleData = (items: Array<{ url: string; title: string; tags: string[] }>): Ogp[] => {
                    return items.map((item) => {
                        return {
                            title: item.title || "",
                            description: "", // OGP取得しないため空文字
                            url: item.url,
                            images: [], // OGP取得しないため空配列
                            tags: item.tags || []
                        };
                    }).filter(a => a.title && a.title.trim() !== "");
                };

                const pickupArticlesData = createArticleData(pickupItems);
                const latestArticlesFromScrapeData = createArticleData(latestItemsFromScrape);
                const latestArticlesData = createArticleData(latestItems);

                console.log('[PublishedArticles] Pickup articles data:', pickupArticlesData.length);
                console.log('[PublishedArticles] Latest articles from scrape data:', latestArticlesFromScrapeData.length);
                console.log('[PublishedArticles] Latest articles data:', latestArticlesData.length);
                console.log('[PublishedArticles] Latest articles data details:', latestArticlesData);

                if (!cancelled) {
                    setPickupArticles(pickupArticlesData);
                    setLatestArticlesFromScrape(latestArticlesFromScrapeData);
                    setLatestArticles(latestArticlesData);
                    // グローバル状態も更新
                    setGlobalArticles({
                        pickupArticles: pickupArticlesData.map(a => ({
                            url: a.url,
                            title: a.title,
                            description: a.description,
                            images: a.images,
                            tags: a.tags || []
                        })),
                        latestArticlesFromScrape: latestArticlesFromScrapeData.map(a => ({
                            url: a.url,
                            title: a.title,
                            description: a.description,
                            images: a.images,
                            tags: a.tags || []
                        })),
                        latestArticles: latestArticlesData.map(a => ({
                            url: a.url,
                            title: a.title,
                            description: a.description,
                            images: a.images,
                            tags: a.tags || []
                        }))
                    });
                    setGlobalLastFetch(Date.now());
                }

            } catch (e) {
                if (!cancelled) {
                    setPickupArticles([]);
                    setLatestArticlesFromScrape([]);
                    setLatestArticles([]);
                }
                console.log(e);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        // グローバル状態にデータがない場合、または5分以上経過している場合は再取得
        const now = Date.now();
        const FIVE_MINUTES = 5 * 60 * 1000;
        if (!globalArticles || (now - globalLastFetch > FIVE_MINUTES)) {
            fetchFresh();
        }

        return () => { cancelled = true; };
    }, [globalArticles, globalLastFetch, setGlobalArticles, setGlobalLastFetch]);

    // 見出しは常に表示するため、ここでは非表示にしない

    return (
        <motion.div
            className="mt-16"
            initial={showAnimations ? {opacity: 0, y: 30} : {opacity: 1, y: 0}}
            animate={{opacity: 1, y: 0}}
            transition={showAnimations ? {delay, duration: 0.6} : {duration: 0}}
        >
            <h2 className="text-lg font-semibold">📝 Published Articles</h2>
            {loading && (
                <div className="mt-4 flex items-center justify-center gap-3">
                    <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-green-400"></div>
                    <p className="text-sm text-zinc-400">記事を取得中...</p>
                </div>
            )}

            {!loading && pickupArticles.length === 0 && latestArticlesFromScrape.length === 0 && latestArticles.length === 0 && (
                <p className="mt-2 text-sm text-zinc-400">記事がまだありません</p>
            )}

            {!loading && (pickupArticles.length > 0 || latestArticlesFromScrape.length > 0 || latestArticles.length > 0) && (
            <>
                {/* ピックアップ記事 */}
                {pickupArticles.length > 0 && (
                    <div className="mt-3">
                        <h3 className="text-md font-semibold text-zinc-300 mb-3">⭐ Pickup Articles</h3>
                        <div className="grid gap-6 sm:grid-cols-1 mt-3">
                            {pickupArticles.map((article, index) => (
                                <ArticleCard
                                    key={article.url}
                                    article={article}
                                    index={index}
                                    showAnimations={showAnimations}
                                    delay={delay + 0.3}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* スクレイピングで取得した最新記事 */}
                {latestArticlesFromScrape.length > 0 && (
                    <div className="mt-6">
                        <h3 className="text-md font-semibold text-zinc-300 mb-3">📰 PickUp Articles</h3>
                        <div className="grid gap-6 sm:grid-cols-1 mt-3">
                            {latestArticlesFromScrape.map((article, index) => (
                                <ArticleCard
                                    key={article.url}
                                    article={article}
                                    index={index}
                                    showAnimations={showAnimations}
                                    delay={delay + 0.3 + (pickupArticles.length * 0.1)}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* QiitaAPIで取得した最新記事 */}
                {latestArticles.length > 0 && (
                    <div className="mt-6">
                        <h3 className="text-md font-semibold text-zinc-300 mb-3">📰 Latest Articles</h3>
                        <div className="grid gap-6 sm:grid-cols-1 mt-3">
                            {latestArticles.map((article, index) => (
                                <ArticleCard
                                    key={article.url}
                                    article={article}
                                    index={index}
                                    showAnimations={showAnimations}
                                    delay={delay + 0.3 + (pickupArticles.length * 0.1) + (latestArticlesFromScrape.length * 0.1)}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </>
            )}

            {!loading && (
                <motion.div
                    className="mt-6 text-center"
                    initial={showAnimations ? {opacity: 0, y: 20} : {opacity: 1, y: 0}}
                    animate={{opacity: 1, y: 0}}
                    transition={showAnimations ? {delay: delay + 1.0, duration: 0.5} : {duration: 0}}
                >
                    <a
                        href="/blogs"
                        className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-6 py-3 text-sm font-medium text-white hover:bg-white/20 transition-all duration-200 ring-1 ring-white/20 hover:ring-white/40"
                    >
                        <span>すべての記事を見る</span>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24"
                             stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                        </svg>
                    </a>
                </motion.div>
            )}
        </motion.div>
    );
};

// 記事カードコンポーネント
const ArticleCard: React.FC<{
    article: Ogp;
    index: number;
    showAnimations: boolean;
    delay: number;
}> = ({ article, index, showAnimations, delay }) => {
    return (
        <motion.a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative rounded-xl border border-white/10 overflow-hidden transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-green-500/20"
            initial={showAnimations ? {opacity: 0, y: 20} : {opacity: 1, y: 0}}
            animate={{opacity: 1, y: 0}}
            transition={showAnimations ? {delay: delay + index * 0.1, duration: 0.5} : {duration: 0}}
            whileHover={{scale: 1.02}}
            whileTap={{scale: 0.98}}
        >
            {/* 背景画像 */}
            {article.images && article.images.length > 0 && (
                <div
                    className="absolute inset-0 bg-cover bg-center opacity-30 group-hover:opacity-40 transition-opacity duration-300"
                    style={{backgroundImage: `url(${article.images[0]})`}}
                />
            )}

            {/* グラデーションオーバーレイ */}
            <div
                className="absolute inset-0 bg-gradient-to-br from-black/40 via-black/50 to-black/60 backdrop-blur-sm"/>

            {/* コンテンツ */}
            <div className="relative p-6">
                <div className="flex items-start gap-3 mb-3">
                    <div className="w-2 h-2 mt-2 rounded-full bg-green-400 animate-pulse flex-shrink-0"/>
                    <h3 className="text-lg font-semibold text-white group-hover:text-green-300 transition-colors line-clamp-2 drop-shadow-lg">
                        {article.title}
                    </h3>
                </div>

                {article.description && (
                    <p className="text-sm text-white/90 line-clamp-2 mb-4 drop-shadow">
                        {article.description}
                    </p>
                )}

                {article.tags && article.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                        {article.tags.slice(0, 5).map((tag, tagIndex) => (
                            <span
                                key={tagIndex}
                                className="px-2 py-1 text-xs rounded-full bg-green-500/20 text-green-300 border border-green-500/30 drop-shadow"
                            >
                                {tag}
                            </span>
                        ))}
                    </div>
                )}

                <div className="mt-4 flex items-center text-green-400 group-hover:text-green-300 transition-colors drop-shadow-lg">
                    <span className="text-sm font-semibold">記事を読む</span>
                    <motion.span
                        className="ml-2"
                        animate={{x: [0, 5, 0]}}
                        transition={{duration: 1.5, repeat: Infinity}}
                    >
                        →
                    </motion.span>
                </div>
            </div>
        </motion.a>
    );
};

