"use client";

import React from "react";
import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { fetchMultipleOgp } from "../app/blogs/server";

interface Ogp {
    title: string;
    description: string;
    url: string;
    images?: string[];
}

// チートシート記事の静的データ
const CHEAT_SHEET_URLS = [
    "https://qiita.com/JavaLangRuntimeException/items/6b46551f56e0def76eba", // git/gh コマンド
    "https://qiita.com/JavaLangRuntimeException/items/42087d09728d5739d73d", // lazygit
    "https://qiita.com/JavaLangRuntimeException/items/21f7c7bf3d143f821697", // Docker コマンド
    "https://qiita.com/JavaLangRuntimeException/items/ab1bc7b976ed2dfad91c", // ステータスコード
    "https://qiita.com/JavaLangRuntimeException/items/5894391c08e0d8e28389", // TypeScript
    "https://qiita.com/JavaLangRuntimeException/items/d388717fc1436bc3ec9d", // Go/Gorm
    "https://qiita.com/JavaLangRuntimeException/items/bf521190f6f4d79e59fb", // testing/gomock
    "https://qiita.com/JavaLangRuntimeException/items/7849b32bc223d4aa0247", // C#/.NET/Unity
    "https://qiita.com/JavaLangRuntimeException/items/42d935cf92c212f1c7ec", // Ruby・Ruby on Rails
    "https://qiita.com/JavaLangRuntimeException/items/f038fbaccdd92fb0308a", // SQL
    "https://qiita.com/JavaLangRuntimeException/items/0c68ab96ea198e0a7294", // Vim
    "https://qiita.com/JavaLangRuntimeException/items/329eb92a47a07ff4dde8", // プルリクエスト・マークダウン記法
    "https://qiita.com/JavaLangRuntimeException/items/16f244606a73f7d106e4", // ファイル操作コマンド
    "https://qiita.com/JavaLangRuntimeException/items/be13dc3a346cf6e5ee44", // VSCode Github Copilot
    "https://qiita.com/JavaLangRuntimeException/items/1a1abc01e8d7d05dce93", // OpenAI Assistants API
    "https://qiita.com/JavaLangRuntimeException/items/4f3551c31679233219ac", // GitHub API
    "https://qiita.com/JavaLangRuntimeException/items/b93865c448f69bcfca4a"  // 変数・関数・クラス命名規則
];

// Jotaiグローバル状態管理
export const qiitaUrlsAtom = atomWithStorage<string[]>('taramanji_qiita_urls', []);
export const ogpCacheAtom = atomWithStorage<Record<string, Ogp>>('taramanji_ogp_cache', {});
export const lastFetchTimeAtom = atomWithStorage<number>('taramanji_last_fetch', 0);
export const currentPageAtom = atomWithStorage<number>('taramanji_current_page', 0);
export const hasMoreAtom = atomWithStorage<boolean>('taramanji_has_more', true);
export const isFetchingAtom = atomWithStorage<boolean>('taramanji_is_fetching', false);

// バックグラウンドfetchの設定
const FETCH_INTERVAL = 30000; // 30秒間隔
const BATCH_SIZE = 3; // 1回のfetchで取得するURL数

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
        const startIndex = currentPage * BATCH_SIZE;
        const totalFetched = qiitaUrls.length;

        if (isFetching || !hasMore || totalFetched >= CHEAT_SHEET_URLS.length) {
            console.log(`[BackgroundFetcher] Fetch skipped: fetching=${isFetching}, hasMore=${hasMore}, totalFetched=${totalFetched}/${CHEAT_SHEET_URLS.length}`);
            if (totalFetched >= CHEAT_SHEET_URLS.length) {
                setHasMore(false);
            }
            return;
        }

        try {
            setIsFetching(true);
            const endIndex = Math.min(startIndex + BATCH_SIZE, CHEAT_SHEET_URLS.length);
            const urlsToFetch = CHEAT_SHEET_URLS.slice(startIndex, endIndex);

            console.log(`[BackgroundFetcher] Fetching batch ${currentPage + 1}: URLs ${startIndex}-${endIndex - 1} (${urlsToFetch.length} URLs)`);

            if (urlsToFetch.length === 0) {
                console.log('[BackgroundFetcher] No more URLs found, stopping fetch');
                setHasMore(false);
                return;
            }

            // 新しいURLのみを追加
            const newUrls = urlsToFetch.filter(url => !qiitaUrls.includes(url));
            const updatedUrls = [...qiitaUrls, ...newUrls];

            if (newUrls.length > 0) {
                setQiitaUrls(updatedUrls);

                // CookieにもURLリストを保存
                setCookie('taramanji_qiita_urls', JSON.stringify(updatedUrls));

                console.log(`[BackgroundFetcher] Added ${newUrls.length} new URLs to cache (Total: ${updatedUrls.length}/${CHEAT_SHEET_URLS.length})`);
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

            // すべてのURLを取得完了したかチェック
            if (updatedUrls.length >= CHEAT_SHEET_URLS.length) {
                console.log(`[BackgroundFetcher] すべての記事を読み込みました (${updatedUrls.length}/${CHEAT_SHEET_URLS.length})`);
                setHasMore(false);
            }

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

                // 復元されたURL数に基づいてページ位置を設定
                const restoredPage = Math.ceil(parsedUrls.length / BATCH_SIZE);
                setCurrentPage(restoredPage);

                // すべて復元済みかチェック
                if (parsedUrls.length >= CHEAT_SHEET_URLS.length) {
                    setHasMore(false);
                    console.log(`[BackgroundFetcher] すべての記事を読み込みました (復元: ${parsedUrls.length}/${CHEAT_SHEET_URLS.length})`);
                }
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
    }, [fetchNextBatch, lastFetchTime, qiitaUrls.length, ogpCache, setQiitaUrls, setOgpCache, setCurrentPage, setHasMore]);

    // このコンポーネントは何もレンダリングしない（バックグラウンド処理のみ）
    return null;
};
