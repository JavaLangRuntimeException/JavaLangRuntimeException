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

// URLのキャッシュ
const urlCache = new Map<number, string[]>();
let isFetchingBackground = false;

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

// Add caching for OGP data
const ogpCache = new Map<string, any>();

/**
 * OGP情報を取得
 */
export async function fetchOgp(url: string) {
    try {
        // Check cache first
        if (ogpCache.has(url)) {
            return ogpCache.get(url);
        }

        const preview = await getLinkPreview(url, {
            followRedirects: "follow",
            timeout: 5000,
            headers: {
                'Accept-Language': 'ja',
            }
        });

        // Store in cache
        ogpCache.set(url, preview);
        return preview;
    } catch (err) {
        console.error("fetchOgp error:", err);
        return {};
    }
}
