"use client";

import React, {useEffect, useState} from "react";
import {motion} from "framer-motion";
import {useAtom} from "jotai";
import {ogpCacheAtom, qiitaUrlsAtom} from "../../../components/BackgroundFetcher";

interface Ogp {
    title: string;
    description: string;
    url: string;
    images?: string[];
}

export const PublishedArticles: React.FC<{ showAnimations?: boolean; delay?: number }> = ({
                                                                                              showAnimations = true,
                                                                                              delay = 0
                                                                                          }) => {
    const [qiitaUrls] = useAtom(qiitaUrlsAtom);
    const [ogpCache] = useAtom(ogpCacheAtom);
    const [articles, setArticles] = useState<Ogp[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        console.log('[PublishedArticles] qiitaUrls:', qiitaUrls.length);
        console.log('[PublishedArticles] ogpCache:', Object.keys(ogpCache).length);

        // 少し遅延を入れてデータが読み込まれるのを待つ
        const timer = setTimeout(() => {
            if (qiitaUrls.length > 0) {
                // 最新6記事を取得
                const latestUrls = qiitaUrls.slice(0, 6);
                const articlesData = latestUrls.map(url => {
                    const cached = ogpCache[url];
                    return {
                        title: cached?.title || "",
                        description: cached?.description || "",
                        url: url,
                        images: cached?.images || []
                    };
                });

                console.log('[PublishedArticles] Articles data:', articlesData);
                setArticles(articlesData);
            }
            setLoading(false);
        }, 1000);

        return () => clearTimeout(timer);
    }, [qiitaUrls, ogpCache]);

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
                <p className="mt-2 text-sm text-zinc-400">記事を取得中...</p>
            )}

            {!loading && articles.length === 0 && (
                <p className="mt-2 text-sm text-zinc-400">記事がまだありません</p>
            )}

            {!loading && articles.length > 0 && (
            <div className="grid gap-6 sm:grid-cols-1 lg:grid-cols-2 mt-3">
                {articles.map((article, index) => (
                    <motion.a
                        key={article.url}
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur transition-all duration-300 hover:bg-white/10 hover:scale-105 hover:shadow-xl hover:shadow-green-500/20"
                        initial={showAnimations ? {opacity: 0, y: 20} : {opacity: 1, y: 0}}
                        animate={{opacity: 1, y: 0}}
                        transition={showAnimations ? {delay: delay + 0.3 + index * 0.1, duration: 0.5} : {duration: 0}}
                        whileHover={{scale: 1.02}}
                        whileTap={{scale: 0.98}}
                    >
                        <div className="flex items-start gap-3 mb-3">
                            <div className="w-2 h-2 mt-2 rounded-full bg-green-400 animate-pulse flex-shrink-0"/>
                            <h3 className="text-lg font-semibold text-white group-hover:text-green-300 transition-colors line-clamp-2">
                                {article.title || "記事タイトル"}
                            </h3>
                        </div>

                        {article.description && (
                            <p className="text-sm text-zinc-300/90 line-clamp-3 mb-4">
                                {article.description}
                            </p>
                        )}

                        <div
                            className="mt-4 flex items-center text-green-400 group-hover:text-green-300 transition-colors">
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
                ))}
            </div>
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

