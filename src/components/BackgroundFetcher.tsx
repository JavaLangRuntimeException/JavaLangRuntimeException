"use client";

import React from "react";
import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { fetchQiitaURLs, fetchMultipleOgp } from "../app/blogs/server";

interface Ogp {
    title: string;
    description: string;
    url: string;
    images?: string[];
}

// Jotaiグローバル状態管理
export const qiitaUrlsAtom = atomWithStorage<string[]>('taramanji_qiita_urls', []);
export const ogpCacheAtom = atomWithStorage<Record<string, Ogp>>('taramanji_ogp_cache', {});
export const lastFetchTimeAtom = atomWithStorage<number>('taramanji_last_fetch', 0);
export const currentPageAtom = atomWithStorage<number>('taramanji_current_page', 1);
export const hasMoreAtom = atomWithStorage<boolean>('taramanji_has_more', true);
export const isFetchingAtom = atomWithStorage<boolean>('taramanji_is_fetching', false);

// バックグラウンドfetchの設定
const FETCH_INTERVAL = 30000; // 30秒間隔
const MAX_PAGES_PER_SESSION = 10; // 1セッションで最大10ページまで取得

// Cookie操作用のヘルパー関数
const setCookie = (name: string, value: string, days: number = 365) => {
    const expires = new Date();
    expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
};

const getCookie = (name: string): string | null => {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) return decodeURIComponent(c.substring(nameEQ.length, c.length));
    }
    return null;
};

export const BackgroundFetcher: React.FC = () => {
    const [qiitaUrls, setQiitaUrls] = useAtom(qiitaUrlsAtom);
    const [ogpCache, setOgpCache] = useAtom(ogpCacheAtom);
    const [lastFetchTime, setLastFetchTime] = useAtom(lastFetchTimeAtom);
    const [currentPage, setCurrentPage] = useAtom(currentPageAtom);
    const [hasMore, setHasMore] = useAtom(hasMoreAtom);
    const [isFetching, setIsFetching] = useAtom(isFetchingAtom);

    const fetchNextBatch = React.useCallback(async () => {
        if (isFetching || !hasMore || currentPage > MAX_PAGES_PER_SESSION) {
            console.log(`[BackgroundFetcher] Fetch skipped: fetching=${isFetching}, hasMore=${hasMore}, page=${currentPage}`);
            return;
        }

        try {
            setIsFetching(true);
            console.log(`[BackgroundFetcher] Fetching page ${currentPage}...`);

            const urls = await fetchQiitaURLs(currentPage, currentPage === 1);

            if (urls.length === 0) {
                console.log('[BackgroundFetcher] No more URLs found, stopping fetch');
                setHasMore(false);
                return;
            }

            // 新しいURLのみを追加
            const newUrls = urls.filter(url => !qiitaUrls.includes(url));
            const updatedUrls = [...qiitaUrls, ...newUrls];

            if (newUrls.length > 0) {
                setQiitaUrls(updatedUrls);

                // CookieにもURLリストを保存
                setCookie('taramanji_qiita_urls', JSON.stringify(updatedUrls));

                console.log(`[BackgroundFetcher] Added ${newUrls.length} new URLs to cache (Total: ${updatedUrls.length})`);
            }

            // OGP情報もバックグラウンドで取得
            const newOgpData = await fetchMultipleOgp(newUrls);
            const updatedOgpCache = { ...ogpCache };

            newUrls.forEach((url, index) => {
                const ogpData = newOgpData[index];
                updatedOgpCache[url] = {
                    title: ogpData.title || "",
                    description: ogpData.description || "",
                    url: ogpData.url || url,
                    images: ogpData.images || []
                };
            });

            setOgpCache(updatedOgpCache);

            // CookieにもOGPキャッシュを保存
            setCookie('taramanji_ogp_cache', JSON.stringify(updatedOgpCache));

            setCurrentPage(prev => prev + 1);
            setLastFetchTime(Date.now());

        } catch (error) {
            console.error('[BackgroundFetcher] Fetch error:', error);
        } finally {
            setIsFetching(false);
        }
    }, [isFetching, hasMore, currentPage, qiitaUrls, ogpCache, setQiitaUrls, setOgpCache, setLastFetchTime, setCurrentPage, setHasMore, setIsFetching]);

    React.useEffect(() => {
        const shouldFetch = () => {
            const now = Date.now();
            return (now - lastFetchTime) > FETCH_INTERVAL;
        };

        // 初回ロード時のCookieからの復元
        const cookieUrls = getCookie('taramanji_qiita_urls');
        const cookieOgp = getCookie('taramanji_ogp_cache');

        if (cookieUrls && qiitaUrls.length === 0) {
            try {
                const parsedUrls = JSON.parse(cookieUrls);
                setQiitaUrls(parsedUrls);
                console.log(`[BackgroundFetcher] Restored ${parsedUrls.length} URLs from cookie`);
            } catch (error) {
                console.error('[BackgroundFetcher] Error parsing URLs from cookie:', error);
            }
        }

        if (cookieOgp && Object.keys(ogpCache).length === 0) {
            try {
                const parsedOgp = JSON.parse(cookieOgp);
                setOgpCache(parsedOgp);
                console.log(`[BackgroundFetcher] Restored ${Object.keys(parsedOgp).length} OGP entries from cookie`);
            } catch (error) {
                console.error('[BackgroundFetcher] Error parsing OGP from cookie:', error);
            }
        }

        // 定期的なバックグラウンドフェッチ
        const interval = setInterval(() => {
            if (shouldFetch()) {
                fetchNextBatch();
            }
        }, FETCH_INTERVAL);

        // 初回実行
        if (shouldFetch()) {
            fetchNextBatch();
        }

        return () => clearInterval(interval);
    }, [fetchNextBatch, lastFetchTime, qiitaUrls.length, ogpCache, setQiitaUrls, setOgpCache]);

    // このコンポーネントは何もレンダリングしない（バックグラウンド処理のみ）
    return null;
};
