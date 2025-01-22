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
 * 指定したpage番号に応じて
 * [JavaLangRuntimeException]ユーザーの記事URL一覧を取得。
 * ここではタイトルなど最小限しか定義していませんが、
 * 実際はもっと多くのプロパティを含む想定です。
 */
export async function fetchQiitaURLs(page: number): Promise<string[]> {
    try {
        const response = await axios.get<QiitaItemResponse[]>(
            `https://qiita.com/api/v2/users/JavaLangRuntimeException/items?page=${page}&per_page=5`,
            {
                headers: {
                    // もしQiitaアクセスが必要な場合はここにトークンを設定
                    Authorization: `Bearer ${process.env.NEXT_PUBLIC_BEARER_TOKEN}`,
                },
            }
        );
        // 取得できたデータのURLだけ返す
        return response.data.map((item) => item.url);
    } catch (error) {
        console.error("fetchQiitaURLs error:", error);
        return [];
    }
}

/**
 * OGP情報を取得
 */
export async function fetchOgp(url: string) {
    try {
        const preview = await getLinkPreview(url, { followRedirects: "follow" });
        return preview;
    } catch (err) {
        console.error("fetchOgp error:", err);
        return {};
    }
}