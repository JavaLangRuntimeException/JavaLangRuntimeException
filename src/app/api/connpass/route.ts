import {NextResponse} from 'next/server';
import * as cheerio from 'cheerio';
interface ConnpassEvent {
    event_id: number;
    title: string;
    catch: string;
    event_url: string;
    started_at: string;
    ended_at: string;
    limit: number;
    accepted: number;
    waiting: number;
    place: string;
    address: string;
    image_url: string;
}
export async function GET(request: Request) {
    const {searchParams} = new URL(request.url);
    const nickname = searchParams.get('nickname') || 'tarakokko3233';
    try {
        // Connpassのユーザープロフィールページをスクレイピング
        const url = `https://connpass.com/user/${nickname}/`;
        console.log('Scraping from URL:', url);
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
            },
            cache: 'no-store',
        });
        console.log('Response status:', response.status);
        if (!response.ok) {
            console.error('Error response status:', response.status);
            return NextResponse.json({
                results_returned: 0,
                results_available: 0,
                results_start: 0,
                events: []
            });
        }
        const html = await response.text();
        const $ = cheerio.load(html);
        const events: ConnpassEvent[] = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        // 主催イベントのみを抽出（.label_status_tag.ownerがあるイベント）
        $('.event_list').each((index, element) => {
            const $event = $(element);
            // 主催イベントかチェック
            const isOwner = $event.find('.label_status_tag.owner').length > 0;
            if (!isOwner) return;
            if (events.length >= 10) return; // 最大10件
            // イベント情報を抽出
            const $link = $event.find('.event_title a.url.summary');
            const title = $link.text().trim();
            const eventUrl = $link.attr('href') || '';
            const eventId = eventUrl.match(/\/event\/(\d+)\//)?.[1] || '';
            // 画像URLを抽出
            const $image = $event.find('.event_thumbnail img.photo');
            const imageUrl = $image.attr('src') || '';
            // 日付情報を抽出
            const year = $event.find('.year').text().trim();
            const date = $event.find('.date').text().trim();
            const time = $event.find('.time').text().trim();
            // 場所情報を抽出（正しいセレクタを使用）
            const $placeIcon = $event.find('.event_place .icon_place');
            const place = $placeIcon.text().trim() || 'オンライン';
            // 参加者情報を抽出
            const $participants = $event.find('.event_participants .amount span');
            const accepted = $participants.first().text().trim();
            const acceptedNum = accepted ? parseInt(accepted) : 0;
            // 定員情報を抽出
            const participantsText = $event.find('.event_participants .amount').text().trim();
            const limitMatch = participantsText.match(/\/\s*(\d+)/);
            const limit = limitMatch ? parseInt(limitMatch[1]) : 0;
            // 日付をパース (例: 2025/11/29（土）13:00〜)
            let startedAt = '';
            let eventDate: Date | null = null;
            const timeMatch = time.match(/（.\）(\d{1,2}):(\d{2})/);
            if (year && date && timeMatch) {
                const [month, day] = date.split('/');
                const [, hour, minute] = timeMatch;
                startedAt = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute}:00+09:00`;
                eventDate = new Date(startedAt);
            }
            // 今日以降のイベントのみ
            if (!eventDate || eventDate < today) {
                return;
            }
            console.log('Found event:', {title, eventUrl, imageUrl, place, date, time});
            if (title && eventUrl) {
                events.push({
                    event_id: parseInt(eventId) || 0,
                    title: title,
                    catch: '',
                    event_url: eventUrl,
                    started_at: startedAt,
                    ended_at: startedAt,
                    limit: limit,
                    accepted: acceptedNum,
                    waiting: 0,
                    place: place,
                    address: '',
                    image_url: imageUrl
                });
            }
        });
        console.log('Scraped events count:', events.length);

        // 日付が近い順（昇順）にソート
        events.sort((a, b) => {
            const dateA = new Date(a.started_at).getTime();
            const dateB = new Date(b.started_at).getTime();
            return dateA - dateB; // 昇順（古い順から新しい順）
        });

        return NextResponse.json({
            results_returned: events.length,
            results_available: events.length,
            results_start: 0,
            events: events
        });
    } catch (error) {
        console.error('Error scraping Connpass events:', error);
        return NextResponse.json({
            results_returned: 0,
            results_available: 0,
            results_start: 0,
            events: []
        });
    }
}
