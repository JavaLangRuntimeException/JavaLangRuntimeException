"use server";

import axios from "axios";
import { getLinkPreview } from "link-preview-js";

/**
 * QiitaのAPIレスポンス例 (必要分のみ定義)
 */
export type QiitaTag = {
    name: string;
    versions: string[];
};

export type QiitaItemResponse = {
    url: string;
    title: string;
    tags: QiitaTag[];
    body?: string; // 本文（Markdown形式）
};

/**
 * OGP情報の型定義
 */
export type OGPResponse = {
    title?: string;
    description?: string;
    url?: string;
    images?: string[];
    [key: string]: unknown; // その他のプロパティ
};

// URLのキャッシュ
const urlCache = new Map<number, string[]>();
let isFetchingBackground = false;

// メモリキャッシュ（拡張版）
const ogpCache = new Map<string, OGPResponse>();
const cacheTimestamps = new Map<string, number>();
const CACHE_DURATION = 365 * 24 * 60 * 60 * 1000; // 1年間（ミリ秒）

/**
 * 指定したpage番号に応じて
 * [JavaLangRuntimeException]ユーザーの記事URL一覧を取得。
 * ここではタイトルなど最小限しか定義していませんが、
 * 実際はもっと多くのプロパティを含む想定です。
 */
export async function fetchQiitaItems(page: number, isInitialLoad: boolean = false, perPageOverride?: number): Promise<QiitaItemResponse[]> {
    try {
        // キャッシュチェック
        if (urlCache.has(page)) {
            // URLキャッシュから復元できないため、キャッシュは無効化
        }

        // perPageOverrideが指定されている場合はそれを使用、否则は初回ロードは15件、それ以外は20件を取得
        const perPage = perPageOverride ?? (isInitialLoad ? 15 : 20);
        const apiUrl = `https://qiita.com/api/v2/users/JavaLangRuntimeException/items?page=${page}&per_page=${perPage}`;

        console.log(`[fetchQiitaItems] Fetching page ${page}, perPage: ${perPage}`);
        console.log(`[fetchQiitaItems] API URL: ${apiUrl}`);
        console.log(`[fetchQiitaItems] Bearer token available: ${!!process.env.NEXT_PUBLIC_BEARER_TOKEN}`);

        const headers: Record<string, string> = {};
        if (process.env.NEXT_PUBLIC_BEARER_TOKEN) {
            headers.Authorization = `Bearer ${process.env.NEXT_PUBLIC_BEARER_TOKEN}`;
        } else {
            console.warn('[fetchQiitaItems] No bearer token found, trying without authentication');
        }

        const response = await axios.get<QiitaItemResponse[]>(
            apiUrl,
            {
                headers,
                timeout: isInitialLoad ? 5000 : 8000, // タイムアウトを延長
            }
        );

        console.log(`[fetchQiitaItems] Response status: ${response.status}`);
        console.log(`[fetchQiitaItems] Response data length: ${response.data?.length || 0}`);

        if (response.data && response.data.length > 0) {
            console.log(`[fetchQiitaItems] First item sample:`, {
                title: response.data[0].title,
                url: response.data[0].url,
                tags: response.data[0].tags?.map(t => t.name) || []
            });
        }

        const items = response.data;
        const urls = items.map((item) => item.url);
        urlCache.set(page, urls);

        console.log(`[fetchQiitaItems] Successfully fetched ${items.length} items for page ${page}`);

        // 初回ロード時は、バックグラウンドで次のページを事前取得
        if (isInitialLoad && !isFetchingBackground && items.length > 0) {
            isFetchingBackground = true;
            fetchQiitaItems(page + 1, false).catch(() => {
                isFetchingBackground = false;
            });
        }

        return items;
    } catch (error) {
        console.error(`[fetchQiitaItems] Error fetching page ${page}:`, error);
        if (axios.isAxiosError(error)) {
            console.error(`[fetchQiitaItems] Response status: ${error.response?.status}`);
            console.error(`[fetchQiitaItems] Response data:`, error.response?.data);
        }
        return [];
    }
}

export async function fetchQiitaURLs(page: number, isInitialLoad: boolean = false): Promise<string[]> {
    const items = await fetchQiitaItems(page, isInitialLoad);
    return items.map((item) => item.url);
}

/**
 * キャッシュの有効性をチェック
 */
function isCacheValid(url: string): boolean {
    const timestamp = cacheTimestamps.get(url);
    if (!timestamp) return false;

    const now = Date.now();
    return (now - timestamp) < CACHE_DURATION;
}

/**
 * OGP情報を取得（長期キャッシュ対応）
 */
export async function fetchOgp(url: string): Promise<OGPResponse> {
    try {
        // Restrict to Qiita pages only
        try {
            const { hostname } = new URL(url);
            if (!hostname.endsWith("qiita.com")) {
                return {};
            }
        } catch {
            return {};
        }
        // キャッシュをチェック（有効期限も考慮）
        if (ogpCache.has(url) && isCacheValid(url)) {
            console.log(`Using cached OGP data for: ${url}`);
            return ogpCache.get(url) || {};
        }

        // 新規取得
        console.log(`Fetching new OGP data for: ${url}`);
        const preview = await getLinkPreview(url, {
            followRedirects: "follow",
            timeout: 5000,
            headers: {
                'Accept-Language': 'ja',
            }
        }) as OGPResponse;

        // キャッシュに保存（タイムスタンプ付き）
        ogpCache.set(url, preview);
        cacheTimestamps.set(url, Date.now());

        return preview;
    } catch (err) {
        console.error("fetchOgp error:", err);
        return {};
    }
}

/**
 * 複数のOGP情報を一括取得（既存キャッシュを最大限活用）
 * @param urls URLの配列
 * @param skipCache キャッシュをスキップして常に最新データを取得する場合true
 */
export async function fetchMultipleOgp(urls: string[], skipCache: boolean = false): Promise<OGPResponse[]> {
    try {
        const results: OGPResponse[] = [];
        const urlsToFetch: string[] = [];

        // 既存キャッシュをチェック（skipCacheがtrueの場合はスキップ）
        for (const url of urls) {
            // Restrict to Qiita pages only
            let isQiita = false;
            try {
                const { hostname } = new URL(url);
                isQiita = hostname.endsWith("qiita.com");
            } catch {
                isQiita = false;
            }

            if (!isQiita) {
                results.push({});
                continue;
            }
            if (!skipCache && ogpCache.has(url) && isCacheValid(url)) {
                results.push(ogpCache.get(url) || {});
            } else {
                // 新規取得が必要
                urlsToFetch.push(url);
                results.push({}); // プレースホルダー
            }
        }

        // 新規取得が必要なURLがある場合
        if (urlsToFetch.length > 0) {
            console.log(`Fetching ${urlsToFetch.length} new OGP data entries`);

            const newOgpData = await Promise.all(
                urlsToFetch.map(async (url) => {
                    try {
                        const preview = await getLinkPreview(url, {
                            followRedirects: "follow",
                            timeout: 5000,
                            headers: {
                                'Accept-Language': 'ja',
                            }
                        }) as OGPResponse;

                        // キャッシュに保存（skipCacheがfalseの場合のみ）
                        if (!skipCache) {
                        ogpCache.set(url, preview);
                        cacheTimestamps.set(url, Date.now());
                        }

                        console.log(`OGP fetched for ${url}: title="${preview.title || 'NO_TITLE'}"`);
                        return { url, data: preview };
                    } catch (error) {
                        console.error(`Error fetching OGP for ${url}:`, error);
                        return { url, data: {} as OGPResponse };
                    }
                })
            );

            // 結果をマージ
            let fetchIndex = 0;
            for (let i = 0; i < urls.length; i++) {
                if (skipCache || !ogpCache.has(urls[i]) || !isCacheValid(urls[i])) {
                    results[i] = newOgpData[fetchIndex].data;
                    fetchIndex++;
                }
            }
        }

        return results;
    } catch (error) {
        console.error("fetchMultipleOgp error:", error);
        return urls.map(() => ({} as OGPResponse));
    }
}

/**
 * キャッシュの統計情報を取得（デバッグ用）
 */
export async function getCacheStats(): Promise<{
    cacheSize: number;
    validCacheCount: number;
    expiredCacheCount: number;
    totalUrls: string[];
}> {
    const now = Date.now();
    let validCount = 0;
    let expiredCount = 0;

    for (const [url] of ogpCache) {
        const timestamp = cacheTimestamps.get(url);
        if (timestamp && (now - timestamp) < CACHE_DURATION) {
            validCount++;
        } else {
            expiredCount++;
        }
    }

    return {
        cacheSize: ogpCache.size,
        validCacheCount: validCount,
        expiredCacheCount: expiredCount,
        totalUrls: [...ogpCache.keys()]
    };
}

/**
 * 期限切れキャッシュをクリーンアップ
 */
export async function cleanupExpiredCache(): Promise<number> {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [url, timestamp] of cacheTimestamps) {
        if ((now - timestamp) >= CACHE_DURATION) {
            ogpCache.delete(url);
            cacheTimestamps.delete(url);
            cleanedCount++;
        }
    }

    console.log(`Cleaned up ${cleanedCount} expired cache entries`);
    return cleanedCount;
}
