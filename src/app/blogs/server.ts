"use server";

import axios from "axios";
import { getLinkPreview } from "link-preview-js";

/**
 * QiitaのAPIレスポンス例 (必要分のみ定義)
 */
export type QiitaItemResponse = {
    url: string;
    title: string;
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
export async function fetchQiitaURLs(page: number, isInitialLoad: boolean = false): Promise<string[]> {
    try {
        // キャッシュチェック
        if (urlCache.has(page)) {
            return urlCache.get(page) || [];
        }

        // 初回ロードは5件だけ高速に取得
        const perPage = isInitialLoad ? 5 : 20;

        const response = await axios.get<QiitaItemResponse[]>(
            `https://qiita.com/api/v2/users/JavaLangRuntimeException/items?page=${page}&per_page=${perPage}`,
            {
                headers: {
                    Authorization: `Bearer ${process.env.NEXT_PUBLIC_BEARER_TOKEN}`,
                },
                timeout: isInitialLoad ? 3000 : 5000, // 初回は短めのタイムアウト
            }
        );

        const urls = response.data.map((item) => item.url);
        urlCache.set(page, urls);

        // 初回ロード時は、バックグラウンドで次のページを事前取得
        if (isInitialLoad && !isFetchingBackground) {
            isFetchingBackground = true;
            fetchQiitaURLs(page + 1, false).catch(() => {
                isFetchingBackground = false;
            });
        }

        return urls;
    } catch (error) {
        console.error("fetchQiitaURLs error:", error);
        return [];
    }
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
 */
export async function fetchMultipleOgp(urls: string[]): Promise<OGPResponse[]> {
    try {
        const results: OGPResponse[] = [];
        const urlsToFetch: string[] = [];

        // 既存キャッシュをチェック
        for (const url of urls) {
            if (ogpCache.has(url) && isCacheValid(url)) {
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

                        // キャッシュに保存
                        ogpCache.set(url, preview);
                        cacheTimestamps.set(url, Date.now());

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
                if (!ogpCache.has(urls[i]) || !isCacheValid(urls[i])) {
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
