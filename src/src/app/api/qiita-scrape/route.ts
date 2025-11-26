import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

interface QiitaArticle {
    url: string;
    title: string;
    tags: string[];
}

export async function GET() {
    try {
        const url = 'https://qiita.com/JavaLangRuntimeException';
        console.log('[QiitaScrape] ===== Starting scrape =====');
        console.log('[QiitaScrape] Scraping from URL:', url);

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
            },
            cache: 'no-store',
        });

        console.log('[QiitaScrape] Response status:', response.status);

        if (!response.ok) {
            console.error('[QiitaScrape] Error response status:', response.status);
            return NextResponse.json({
                pickupArticles: [],
                latestArticles: []
            });
        }

        const html = await response.text();
        const $ = cheerio.load(html);
        const pickupArticles: QiitaArticle[] = [];
        const latestArticles: QiitaArticle[] = [];

        // 記事を取得する共通関数
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const extractArticle = ($element: any, $: cheerio.CheerioAPI): QiitaArticle | null => {
            // h2タグ内のリンクを優先的に探す（タイトルリンク）
            const $titleLink = $element.find('h2 a[href*="/items/"]').first();
            const $link = $titleLink.length > 0 ? $titleLink : $element.find('a[href*="/items/"]').first();
            const href = $link.attr('href');

            // タイトルを取得（h2内のテキストを優先）
            let title = '';
            const $h2 = $element.find('h2');
            if ($h2.length > 0) {
                title = $h2.text().trim();
            }
            if (!title) {
                title = $link.text().trim() || $element.find('h3').text().trim();
            }

            if (!href || !title) {
                console.log('[QiitaScrape] Failed to extract article - href:', href, 'title:', title);
                return null;
            }

            const fullUrl = href.startsWith('http') ? href : `https://qiita.com${href}`;

            const tags: string[] = [];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            $element.find('a[href*="/tags/"]').each((_: number, tagEl: any) => {
                const tagText = $(tagEl).text().trim();
                if (tagText && !tags.includes(tagText)) {
                    tags.push(tagText);
                }
            });

            return {
                url: fullUrl,
                title: title,
                tags: tags
            };
        };

        // 記事がピックアップ（ストック済み）かどうかを判定する関数
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const isPickupArticle = ($article: any): boolean => {
            // 複数の方法でストックボタンを探す
            // 1. aria-labelに「ストック」が含まれるボタンを探す
            let $stockButton = $article.find('button[aria-label*="ストック"]');

            // 2. 見つからない場合は、button内のsvgパスから判定（チェックマークのパスがある場合はストック済み）
            if ($stockButton.length === 0) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                $stockButton = $article.find('button').filter((_: number, btn: any) => {
                    const $btn = $(btn);
                    const ariaLabel = $btn.attr('aria-label') || '';
                    return ariaLabel.includes('ストック');
                });
            }

            if ($stockButton.length === 0) {
                // ストックボタンが見つからない場合は、svgパスを直接確認
                const $allButtons = $article.find('button');
                for (let i = 0; i < $allButtons.length; i++) {
                    const $btn = $($allButtons[i]);
                    const $svg = $btn.find('svg');
                    if ($svg.length > 0) {
                        const $path = $svg.find('path');
                        const pathData = $path.attr('d') || '';
                        // チェックマークのパス（短いパス）を確認
                        if (pathData.includes('2.85 9.35') || pathData.includes('2.47 2.47')) {
                            console.log('[QiitaScrape] Found stock button by SVG path');
                            return true;
                        }
                    }
                }
                console.log('[QiitaScrape] No stock button found for article');
                return false;
            }

            // ストック済みの場合は「ストックを編集する」、未ストックの場合は「ストックする」
            const ariaLabel = $stockButton.first().attr('aria-label') || '';
            console.log('[QiitaScrape] Stock button aria-label:', ariaLabel);

            // 「ストックを編集する」が含まれている場合はピックアップ記事
            const isPickup = ariaLabel.includes('ストックを編集する');

            // SVGパスも確認（より確実に判定）
            if (!isPickup) {
                const $svg = $stockButton.find('svg');
                if ($svg.length > 0) {
                    const $path = $svg.find('path');
                    const pathData = $path.attr('d') || '';
                    // チェックマークのパス（短いパス）を確認
                    if (pathData.includes('2.85 9.35') || pathData.includes('2.47 2.47')) {
                        console.log('[QiitaScrape] Found pickup article by SVG path');
                        return true;
                    }
                }
            }

            console.log('[QiitaScrape] Is pickup article:', isPickup);
            return isPickup;
        };

        // すべての記事を取得
        const allArticles: QiitaArticle[] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allArticleElements: any[] = [];

        // 記事リストから取得（順番を保持）
        $('article').each((index, element) => {
            const $article = $(element);
            // 記事のリンクがあるか確認（h2内のリンクを優先）
            const $h2Link = $article.find('h2 a[href*="/items/"]').first();
            const $link = $h2Link.length > 0 ? $h2Link : $article.find('a[href*="/items/"]').first();
            if ($link.length === 0) {
                console.log(`[QiitaScrape] Article ${index + 1}: No link found, skipping`);
                return;
            }

            const article = extractArticle($article, $);
            if (article && !allArticles.find(a => a.url === article.url)) {
                allArticles.push(article);
                allArticleElements.push(element);
                console.log(`[QiitaScrape] Article ${allArticles.length}: "${article.title}" - ${article.url}`);
            } else if (article) {
                console.log(`[QiitaScrape] Article ${index + 1}: Duplicate URL, skipping - ${article.url}`);
            }
        });

        console.log(`[QiitaScrape] Found ${allArticles.length} total articles`);

        // ピックアップ記事と最新記事を分離
        // まず、すべての記事についてピックアップかどうかを判定
        const pickupCandidates: QiitaArticle[] = [];
        const latestCandidates: QiitaArticle[] = [];

        allArticleElements.forEach((element, index) => {
            const $article = $(element);
            const article = allArticles[index];

            if (!article) {
                return;
            }

            const isPickup = isPickupArticle($article);
            console.log(`[QiitaScrape] Article ${index + 1}: "${article.title}" - IsPickup: ${isPickup}`);

            if (isPickup) {
                // ピックアップ記事（ストック済み）
                if (!pickupCandidates.find(a => a.url === article.url)) {
                    pickupCandidates.push(article);
                    console.log(`[QiitaScrape] Added to pickup candidates (${pickupCandidates.length})`);
                }
            } else {
                // 最新記事（未ストック）
                if (!latestCandidates.find(a => a.url === article.url) && !pickupCandidates.find(a => a.url === article.url)) {
                    latestCandidates.push(article);
                    console.log(`[QiitaScrape] Added to latest candidates (${latestCandidates.length})`);
                }
            }
        });

        // ピックアップ記事から最初の3つを取得
        pickupArticles.push(...pickupCandidates.slice(0, 3));

        // 最新記事から最初の3つを取得（ピックアップ記事と重複しないように）
        const pickupUrls = new Set(pickupArticles.map(a => a.url));
        const filteredLatest = latestCandidates.filter(a => !pickupUrls.has(a.url));

        // 最新記事が不足している場合は、ピックアップ候補から補完（すべてがピックアップとして判定されている場合の対策）
        if (filteredLatest.length < 3 && pickupCandidates.length > 3) {
            // ピックアップ候補の4番目以降を最新記事として扱う
            const additionalLatest = pickupCandidates.slice(3).filter(a => !pickupUrls.has(a.url));
            filteredLatest.push(...additionalLatest);
            console.log(`[QiitaScrape] Added ${additionalLatest.length} articles from pickup candidates to latest articles`);
        }

        latestArticles.push(...filteredLatest.slice(0, 3));

        console.log('[QiitaScrape] ===== Final Results =====');
        console.log('[QiitaScrape] Pickup articles count:', pickupArticles.length);
        console.log('[QiitaScrape] Latest articles count:', latestArticles.length);
        console.log('[QiitaScrape] Pickup articles:', pickupArticles.map(a => a.title));
        console.log('[QiitaScrape] Latest articles:', latestArticles.map(a => a.title));
        console.log('[QiitaScrape] ===== End scrape =====');

        return NextResponse.json({
            pickupArticles: pickupArticles.slice(0, 3),
            latestArticles: latestArticles.slice(0, 3)
        });
    } catch (error) {
        console.error('[QiitaScrape] Error scraping Qiita profile:', error);
        return NextResponse.json({
            pickupArticles: [],
            latestArticles: []
        }, { status: 500 });
    }
}

