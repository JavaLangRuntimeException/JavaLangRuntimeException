"use client";

import React, {useEffect} from "react";
import {motion} from "framer-motion";
import {useAtom} from "jotai";
import {ProfileHeader} from "../feature/profile/ui/profile-header";
import {AffiliationBadges} from "../feature/affiliations/ui/badges";
import {HeroBackground} from "../shared/ui/HeroBackground";
import {SkillBadges} from "../feature/skills/ui/SkillBadges";
import {ConnpassEventCards} from "../feature/connpass/ui/EventCards";
import {PublishedArticles} from "../feature/articles/ui/PublishedArticles";
import {useIntro} from "../shared/contexts/IntroContext";
import {
    connpassEventsAtom,
    connpassLastFetchAtom,
    publishedArticlesAtom,
    publishedArticlesLastFetchAtom
} from "../components/BackgroundFetcher";

import { NavCards } from "../shared/ui/NavCards";
import { FloatingParticles } from "../shared/ui/Particles";
import { showAnimationsAtom } from "../shared/atoms/ui";


export default function PortfolioLinks() {
    const bgImages = ["/image.png", "/image2.png", "/image3.png"];
    const [showAnimations, setShowAnimations] = useAtom(showAnimationsAtom);
    const {showIntro, introCompleted, setIntroCompleted} = useIntro();
    const [connpassEvents, setConnpassEvents] = useAtom(connpassEventsAtom);
    const [connpassLastFetch, setConnpassLastFetch] = useAtom(connpassLastFetchAtom);
    const [publishedArticles, setPublishedArticles] = useAtom(publishedArticlesAtom);
    const [publishedArticlesLastFetch, setPublishedArticlesLastFetch] = useAtom(publishedArticlesLastFetchAtom);

    useEffect(() => {
        // 内部ナビゲーションかどうかをチェック
        const isInternalNavigation = sessionStorage.getItem('internal_navigation') === 'true';
        const introShown = sessionStorage.getItem('intro_shown') === '1';

        // 内部ナビゲーションの場合、またはイントロが既に表示済みの場合はアニメーションを無効化
        if (isInternalNavigation || introShown) {
            setShowAnimations(false);
        }
    }, [setShowAnimations]);

    // プログレス完了時のコールバック（プロフィールアニメーションの準備）
    const handleProgressComplete = () => {
        // プログレス完了時は何もしない（イントロ完了まで待機）
    };

    // イントロ表示中にデータをプリフェッチ
    useEffect(() => {
        if (showIntro && !introCompleted) {
            // Connpassイベントの取得（キャッシュなし、都度取得）
            const fetchConnpassEvents = async () => {
                try {
                    console.log('[PortfolioLinks] Prefetching Connpass events during intro...');
                    const response = await fetch('/api/connpass', { cache: 'no-store' });
                    const data = await response.json();
                    if (data.events && data.events.length > 0) {
                        setConnpassEvents(data.events);
                        setConnpassLastFetch(Date.now());
                    }
                } catch (error) {
                    console.error('[PortfolioLinks] Error prefetching Connpass events:', error);
                }
            };

            // 記事データの取得（5分キャッシュ）
            const fetchPublishedArticles = async () => {
                const now = Date.now();
                const FIVE_MINUTES = 5 * 60 * 1000;
                if (now - publishedArticlesLastFetch > FIVE_MINUTES || !publishedArticles) {
                    try {
                        console.log('[PortfolioLinks] Prefetching published articles during intro...');

                        // ピックアップ記事とスクレイピングで取得したLatest Articlesはスクレイピングから取得
                        const scrapeRes = await fetch(`/api/qiita-scrape?t=${Date.now()}`, { cache: "no-store" });
                        const scrapeJson: {
                            pickupArticles?: Array<{ url: string; title: string; tags: string[] }>;
                            latestArticles?: Array<{ url: string; title: string; tags: string[] }>;
                        } = await scrapeRes.json();

                        const pickupItems = scrapeJson?.pickupArticles || [];
                        const latestItemsFromScrape = scrapeJson?.latestArticles || [];

                        // LatestArticlesはQiitaAPIから取得（ピックアップ記事と重複しない最新3件）
                        // 重複を考慮して多めに取得（最大10件取得してからフィルタリング）
                        const qiitaApiRes = await fetch(`/api/qiita?page=1&includeTags=1&perPage=10`, { cache: "no-store" });
                        const qiitaApiJson: {
                            items?: Array<{
                                url: string;
                                title: string;
                                body?: string;
                                tags: Array<{ name: string }>
                            }>
                        } = await qiitaApiRes.json();

                        console.log('[PortfolioLinks] QiitaAPI response:', qiitaApiJson?.items?.length || 0, 'items');

                        // ピックアップ記事とスクレイピングで取得したLatest ArticlesのURLを取得（重複除外用）
                        const pickupUrlsSet = new Set(pickupItems.map(item => item.url));
                        const scrapeLatestUrlsSet = new Set(latestItemsFromScrape.map(item => item.url));
                        const allExcludedUrlsSet = new Set([...pickupUrlsSet, ...scrapeLatestUrlsSet]);
                        console.log('[PortfolioLinks] Pickup URLs:', Array.from(pickupUrlsSet));
                        console.log('[PortfolioLinks] Scrape Latest URLs:', Array.from(scrapeLatestUrlsSet));

                        // ピックアップ記事とスクレイピングLatest Articlesと重複しない最新記事を取得（最大3件）
                        const allApiItems = qiitaApiJson?.items || [];
                        const filteredItems = allApiItems.filter(item => !allExcludedUrlsSet.has(item.url));
                        console.log('[PortfolioLinks] Filtered items (after removing pickup and scrape latest duplicates):', filteredItems.length);

                        const latestItems = filteredItems
                            .slice(0, 3) // 最大3件
                            .map(item => ({
                                url: item.url,
                                title: item.title,
                                tags: item.tags.map(tag => tag.name)
                            }));

                        console.log('[PortfolioLinks] Latest items from QiitaAPI:', latestItems);
                        console.log('[PortfolioLinks] Latest items count:', latestItems.length);
                        console.log('[PortfolioLinks] Pickup items:', pickupItems);
                        console.log('[PortfolioLinks] Latest items from scrape:', latestItemsFromScrape);

                        const allItems = [...pickupItems, ...latestItemsFromScrape, ...latestItems];

                        if (allItems.length > 0) {
                            // OGP取得なしで、直接記事データを作成
                            const createArticleData = (items: Array<{ url: string; title: string; tags: string[] }>) => {
                                return items.map((item) => {
                                    return {
                                        url: item.url,
                                        title: item.title || "",
                                        description: "", // OGP取得しないため空文字
                                        images: [], // OGP取得しないため空配列
                                        tags: item.tags || []
                                    };
                                }).filter(a => a.title && a.title.trim() !== "");
                            };

                            setPublishedArticles({
                                pickupArticles: createArticleData(pickupItems),
                                latestArticlesFromScrape: createArticleData(latestItemsFromScrape),
                                latestArticles: createArticleData(latestItems)
                            });
                            setPublishedArticlesLastFetch(Date.now());
                            console.log('[PortfolioLinks] Prefetched published articles (without OGP)');
                        }
                    } catch (error) {
                        console.error('[PortfolioLinks] Error prefetching published articles:', error);
                    }
                }
            };

            // 両方のデータを並行して取得
            fetchConnpassEvents();
            fetchPublishedArticles();
        }
    }, [showIntro, introCompleted, connpassEvents, connpassLastFetch, publishedArticles, publishedArticlesLastFetch, setConnpassEvents, setConnpassLastFetch, setPublishedArticles, setPublishedArticlesLastFetch]);

    // イントロ完了時のコールバック（welcomeからルートに移動した時）
    const handleIntroComplete = () => {
        // イントロ完了をマーク
        setIntroCompleted(true);
        // イントロ完了後にプロフィールアニメーションを開始
        setTimeout(() => {
            setShowAnimations(true);
        }, 200); // イントロのフェードアウト完了後にアニメーション開始
    };

    return (
        <HeroBackground
            images={bgImages}
            intro={{
                enabled: showIntro,
                title: "taramanji",
                subtitle: "JavaLangRuntimeException",
                onlyFirstVisit: true,
                onComplete: handleIntroComplete,
                onProgressComplete: handleProgressComplete
            }}
        >
            {/* Welcome画面表示中は黒い背景のみ表示 */}
            {showIntro && !introCompleted && (
                <div className="fixed inset-0 bg-black z-10"/>
            )}
            {/* ダイナミックなタイトルアニメーション */}
            {introCompleted && (
                <motion.div
                    className="text-center mb-12"
                    initial={showAnimations ? {scale: 0.9, opacity: 0} : {scale: 1, opacity: 1}}
                    animate={{
                        scale: 1,
                        opacity: 1
                    }}
                    transition={showAnimations ? {
                        duration: 0.6,
                        delay: 0.2,
                        ease: "easeOut"
                    } : {duration: 0}}
                >
                    <motion.h1
                        className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-4 relative"
                        style={{
                            background: "linear-gradient(135deg, #ffffff 0%, #3b82f6 50%, #8b5cf6 100%)",
                            backgroundClip: "text",
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                            filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.3))"
                        }}
                        animate={{
                            backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
                        }}
                        transition={{
                            duration: 8,
                            repeat: Infinity,
                            ease: "linear"
                        }}
                    >
                        taramanji
                    </motion.h1>

                </motion.div>
            )}

            {/* サブタイトル */}
            {introCompleted && (
                <motion.div
                    className="text-center mb-16"
                    initial={showAnimations ? {opacity: 0, y: 20} : {opacity: 1, y: 0}}
                    animate={{opacity: 1, y: 0}}
                    transition={showAnimations ? {delay: 0.4, duration: 0.6} : {duration: 0}}
                >
                    <motion.p
                        className="text-lg sm:text-xl md:text-2xl text-white/90 font-light tracking-wide"
                        animate={{
                            opacity: [0.8, 1, 0.8],
                        }}
                        transition={{
                            duration: 4,
                            repeat: Infinity,
                            ease: "easeInOut"
                        }}
                    >
                        Engineer • Community Director
                    </motion.p>
                </motion.div>
            )}

            {/* メインコンテンツエリア */}
            {introCompleted && (
                <motion.div
                    className="mx-auto max-w-4xl"
                    initial={showAnimations ? {opacity: 0, y: 50} : {opacity: 1, y: 0}}
                    animate={{opacity: 1, y: 0}}
                    transition={showAnimations ? {delay: 0.6, duration: 0.7} : {duration: 0}}
                >
                    {/* ProfileHeader */}
                    <motion.div
                        initial={showAnimations ? {scale: 0.9, opacity: 0} : {scale: 1, opacity: 1}}
                        animate={{scale: 1, opacity: 1}}
                        transition={showAnimations ? {delay: 0.8, duration: 0.6} : {duration: 0}}
                    >
                        <ProfileHeader/>
                    </motion.div>

                    {/* ナビゲーションカード */}
                    <NavCards
                        items={[
                            { href: "/link", title: "Links", color: "blue", description: <>プロフィール・SNSのリンク一覧</> },
                            { href: "/contact", title: "Contact", color: "green", description: <>お問い合わせフォーム<br/>ご質問・ご相談はこちらから</> },
                            { href: "/reserve", title: "Ask Me", color: "purple", description: <>ご相談・面談予約ページ<br/>ご希望の日時を選択してください</> },
                        ]}
                        animate={showAnimations}
                        delay={1.0}
                    />

                    {/* Affiliation */}
                    <motion.div
                        initial={showAnimations ? {opacity: 0, y: 30} : {opacity: 1, y: 0}}
                        animate={{opacity: 1, y: 0}}
                        transition={showAnimations ? {delay: 1.2, duration: 0.6} : {duration: 0}}
                    >
                        <AffiliationBadges/>
                    </motion.div>

                    {/* Skill Set */}
                    <motion.div
                        initial={showAnimations ? {opacity: 0, y: 30} : {opacity: 1, y: 0}}
                        animate={{opacity: 1, y: 0}}
                        transition={showAnimations ? {delay: 1.4, duration: 0.6} : {duration: 0}}
                    >
                        <SkillBadges/>
                    </motion.div>

                    {/* Organized Events */}
                    <motion.div
                        initial={showAnimations ? {opacity: 0, y: 30} : {opacity: 1, y: 0}}
                        animate={{opacity: 1, y: 0}}
                        transition={showAnimations ? {delay: 1.6, duration: 0.6} : {duration: 0}}
                    >
                        <ConnpassEventCards showAnimations={showAnimations} delay={1.6}/>
                    </motion.div>

                    {/* Published Articles */}
                    <motion.div
                        initial={showAnimations ? {opacity: 0, y: 30} : {opacity: 1, y: 0}}
                        animate={{opacity: 1, y: 0}}
                        transition={showAnimations ? {delay: 1.8, duration: 0.6} : {duration: 0}}
                    >
                        <PublishedArticles showAnimations={showAnimations} delay={1.8}/>
                    </motion.div>
                </motion.div>
            )}

            {/* フローティングパーティクルエフェクト */}
            {introCompleted && <FloatingParticles enabled />}

        </HeroBackground>
    );
}
