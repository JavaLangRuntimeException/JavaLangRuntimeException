"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { atom, useAtom } from "jotai";
import { fetchQiitaURLs, fetchOgp } from "./server";
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
    const [hasMore, setHasMore] = React.useState(true);
    const { ref, inView } = useInView();

    const fetchedUrls = React.useRef<Set<string>>(new Set());

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
            setHasMore(false);
        } finally {
            setLoading(false);
        }
    }, [loading, hasMore]);

    React.useEffect(() => {
        fetchArticles(1, false);
    }, []);

    React.useEffect(() => {
        if (inView && hasMore && !loading) {
            setCurrentPage((prev) => {
                const nextPage = prev + 1;
                fetchArticles(nextPage, true);
                return nextPage;
            });
        }
    }, [inView, hasMore, loading, fetchArticles]);

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

                {!loading && hasMore && (
                    <div ref={ref} className="h-10 w-full" />
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
