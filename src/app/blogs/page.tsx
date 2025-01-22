"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { atom, useAtom } from "jotai";
import { fetchQiitaURLs, fetchOgp } from "./server";
import Link from "next/link";
import Image from 'next/image';

const searchAtom = atom("");

interface Ogp {
    title: string;
    description: string;
    url: string;
    images?: string[];
}

// fetchOgpの戻り値の型を明示的に定義
type OgpResponse = {
    title?: string;
    description?: string;
    url?: string;
    images?: string[];
}

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
    const [currentPage, setCurrentPage] = React.useState(1);

    const fetchedUrls = React.useRef<Set<string>>(new Set());
    const intervalRef = React.useRef<NodeJS.Timeout | null>(null);

    const stopPolling = () => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
    };

    React.useEffect(() => {
        const startPolling = () => {
            if (intervalRef.current) return;
            intervalRef.current = setInterval(() => {
                setCurrentPage((prev) => {
                    const nextPage = prev + 1;
                    fetchArticles(nextPage, true);
                    return nextPage;
                });
            }, 8000);
        };

        fetchArticles(currentPage, true);
        startPolling();

        return () => {
            stopPolling();
        };
    }, [currentPage]);

    const fetchArticles = async (page: number, shouldAppend: boolean) => {
        try {
            setLoading(true);
            const urls = await fetchQiitaURLs(page);
            const newUrls = urls.filter((url) => !fetchedUrls.current.has(url));
            newUrls.forEach((url) => fetchedUrls.current.add(url));

            if (newUrls.length === 0) {
                console.log("No new articles to fetch");
                return;
            }

            const ogpResults = await Promise.all(
                newUrls.map(async (url) => {
                    const result = await fetchOgp(url) as OgpResponse;
                    return {
                        title: result.title ?? "",
                        description: result.description ?? "",
                        url: result.url ?? "",
                        images: result.images ?? []
                    } satisfies Ogp;
                })
            );

            setArticles((prev) =>
                shouldAppend ? [...prev, ...ogpResults] : ogpResults
            );
        } catch (error) {
            console.error("Error fetching articles:", error);
        } finally {
            setLoading(false);
        }
    };

    const filteredData = React.useMemo(() => {
        let filtered = articles;

        if (searchText.trim()) {
            const key = searchText.toLowerCase();
            filtered = filtered.filter((ogpObj) => {
                const title = (ogpObj.title || "").toLowerCase();
                return title.includes(key);
            });
        }

        if (selectedSeries) {
            filtered = filtered.filter((ogpObj) => {
                const title = ogpObj.title || "";
                return title.includes(selectedSeries);
            });
        }

        return filtered;
    }, [articles, searchText, selectedSeries]);

    const handleSeriesClick = (series: string) => setSelectedSeries(series);
    const clearSeries = () => setSelectedSeries("");

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchText(e.target.value);
    };

    return (
        <main className="p-4">
            <AnimatePresence mode="wait">
                <motion.div className="mb-6 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <h1 className="text-xl font-bold">Qiita 記事一覧</h1>
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
                                key={`${url}-${idx}`}
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
                                    />
                                )}
                                <h2 className="font-bold text-lg mb-1">{title}</h2>
                                <p className="text-sm line-clamp-3">{description}</p>
                            </motion.a>
                        );
                    })}
                </div>

                <div className="text-center mt-6">{loading && <p>新しい記事を取得中...</p>}</div>
            </AnimatePresence>
        </main>
    );
}
