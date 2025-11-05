"use client";

import React, {useEffect, useState} from "react";
import {motion} from "framer-motion";

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
    const [articles, setArticles] = useState<Ogp[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        async function fetchFresh() {
            try {
                setLoading(true);
                // 最新URL一覧を取得（初回パラメータで安定）
                const urlRes = await fetch(`/api/qiita?page=1&initial=1`, { cache: "no-store" });
                const urlJson: { urls: string[] } = await urlRes.json();
                const latestUrls = (urlJson?.urls || []).slice(0, 6);
                if (latestUrls.length === 0) {
                    if (!cancelled) setArticles([]);
                    return;
                }
                // OGPを都度取得
                const ogpRes = await fetch(`/api/ogp`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ urls: latestUrls }),
                    cache: "no-store",
                });
                const ogpJson: { data: Ogp[] } = await ogpRes.json();
                const data = Array.isArray(ogpJson?.data) ? ogpJson.data : [];
                const articlesData: Ogp[] = latestUrls.map((u) => {
                    const found = data.find((d) => d.url === u) || {} as Ogp;
                    return { title: found.title || "", description: found.description || "", url: u, images: found.images || [] };
                });
                if (!cancelled) setArticles(articlesData);
            } catch (e) {
                if (!cancelled) setArticles([]);
                console.log(e);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        fetchFresh();
        return () => { cancelled = true; };
    }, []);

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

