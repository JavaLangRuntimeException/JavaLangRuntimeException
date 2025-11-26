import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

interface ArticleLink {
    url: string;
    title: string;
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const articleUrl = searchParams.get('url');

        if (!articleUrl) {
            return NextResponse.json({ links: [] }, { status: 400 });
        }

        console.log('[QiitaScrapeArticle] Scraping article:', articleUrl);

        const response = await fetch(articleUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
            },
            cache: 'no-store',
        });

        if (!response.ok) {
            console.error('[QiitaScrapeArticle] Error response status:', response.status);
            return NextResponse.json({ links: [] });
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        const links: ArticleLink[] = [];

        // 「他のチートシート」セクションを探す
        $('h2, h3, h4').each((_: number, heading) => {
            const $heading = $(heading);
            const headingText = $heading.text().trim();

            // 「他のチートシート」という見出しを探す
            if (headingText.includes('他のチートシート') || headingText.includes('チートシート')) {
                console.log('[QiitaScrapeArticle] Found cheat sheet section:', headingText);

                // 見出しの後の要素を取得
                let $current = $heading.next();
                let depth = 0;

                // 次の見出しまで、または記事の終わりまで処理
                while ($current.length > 0 && depth < 1000) {
                    depth++;

                    // 次の同じレベル以上の見出しが見つかったら終了
                    const tagName = $current.prop('tagName');
                    if (tagName && ['H1', 'H2', 'H3', 'H4'].includes(tagName)) {
                        const nextHeadingText = $current.text().trim();
                        // 他の主要セクション（「他のシリーズ記事」など）が来たら終了
                        if (nextHeadingText.includes('他のシリーズ記事') ||
                            nextHeadingText.includes('シリーズ記事') ||
                            (nextHeadingText.length > 0 && !nextHeadingText.includes('チートシート'))) {
                            break;
                        }
                    }

                    // リンクを探す
                    $current.find('a[href*="/items/"]').each((_: number, link) => {
                        const $link = $(link);
                        const href = $link.attr('href');
                        const linkText = $link.text().trim();

                        if (href && linkText) {
                            const fullUrl = href.startsWith('http') ? href : `https://qiita.com${href}`;

                            // 既に追加済みでないか確認
                            if (!links.find(l => l.url === fullUrl)) {
                                links.push({
                                    url: fullUrl,
                                    title: linkText
                                });
                                console.log('[QiitaScrapeArticle] Found link:', linkText, fullUrl);
                            }
                        }
                    });

                    $current = $current.next();
                }
            }
        });

        // 見出しでの検索がうまくいかない場合、記事本文全体から「他のチートシート」の近くのリンクを探す
        if (links.length === 0) {
            $('article, .it-article_body').each((_: number, article) => {
                const $article = $(article);

                // 「他のチートシート」というテキストを含む要素を探す
                $article.find('h2, h3, h4, p').each((_: number, element) => {
                    const $el = $(element);
                    const text = $el.text().trim();

                    if (text.includes('他のチートシート')) {
                        // この要素から下のリンクを取得
                        let $current = $el.next();
                        let depth = 0;

                        while ($current.length > 0 && depth < 500) {
                            depth++;
                            $current.find('a[href*="/items/"]').each((_: number, link) => {
                                const $link = $(link);
                                const href = $link.attr('href');
                                const linkText = $link.text().trim();

                                if (href && linkText) {
                                    const fullUrl = href.startsWith('http') ? href : `https://qiita.com${href}`;

                                    if (!links.find(l => l.url === fullUrl)) {
                                        links.push({
                                            url: fullUrl,
                                            title: linkText
                                        });
                                    }
                                }
                            });

                            // 次の見出しが見つかったら終了
                            const tagName = $current.prop('tagName');
                            if (tagName && ['H1', 'H2', 'H3'].includes(tagName)) {
                                const nextText = $current.text().trim();
                                if (nextText.includes('他のシリーズ記事') || nextText.includes('シリーズ記事')) {
                                    break;
                                }
                            }

                            $current = $current.next();
                        }
                    }
                });
            });
        }

        console.log(`[QiitaScrapeArticle] Found ${links.length} cheat sheet links`);
        return NextResponse.json({ links });
    } catch (error) {
        console.error('[QiitaScrapeArticle] Error:', error);
        return NextResponse.json({ links: [] }, { status: 500 });
    }
}

