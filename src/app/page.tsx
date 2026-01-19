"use client";

import React, {useEffect} from "react";
import {motion} from "framer-motion";
import {useAtom, useAtomValue} from "jotai";
import {ProfileHeader} from "../feature/profile/ui/profile-header";
import {AffiliationBadges} from "../feature/affiliations/ui/badges";
import {HeroBackground} from "../shared/ui/HeroBackground";
import {SkillBadges} from "../feature/skills/ui/SkillBadges";
import {ConnpassEventCards} from "../feature/connpass/ui/EventCards";
import {PublishedArticles} from "../feature/articles/ui/PublishedArticles";
import {useIntro} from "../shared/contexts/IntroContext";
import { NavCards } from "../shared/ui/NavCards";
import { FloatingParticles } from "../shared/ui/Particles";
import { showAnimationsAtom } from "../shared/atoms/ui";
import {
    connpassEventsAtom,
    connpassLastFetchAtom,
    publishedArticlesAtom,
    publishedArticlesLastFetchAtom
} from "../components/BackgroundFetcher";


export default function PortfolioLinks() {
    const bgImages = ["/image.png", "/image2.png", "/image3.png"];
    const [showAnimations, setShowAnimations] = useAtom(showAnimationsAtom);
    const {showIntro, introCompleted, setIntroCompleted} = useIntro();
    // グローバル状態の読み取り（書き込みはsetterのみ）
    const connpassEvents = useAtomValue(connpassEventsAtom);
    const connpassLastFetch = useAtomValue(connpassLastFetchAtom);
    const publishedArticles = useAtomValue(publishedArticlesAtom);
    const publishedArticlesLastFetch = useAtomValue(publishedArticlesLastFetchAtom);
    // セッターのみ
    const [, setConnpassEvents] = useAtom(connpassEventsAtom);
    const [, setConnpassLastFetch] = useAtom(connpassLastFetchAtom);
    const [, setPublishedArticles] = useAtom(publishedArticlesAtom);
    const [, setPublishedArticlesLastFetch] = useAtom(publishedArticlesLastFetchAtom);

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

    // データ取得フラグ（マウント時に1回だけ実行するため）
    const fetchStartedRef = React.useRef(false);

    // データ取得（ページマウント時に1回だけ実行、Welcomeページ表示中も実行可能）
    useEffect(() => {
        // 既に取得を開始している場合はスキップ
        if (fetchStartedRef.current) {
            return;
        }

        const now = Date.now();
        const FIVE_MINUTES = 5 * 60 * 1000;

        // Connpassイベントの取得判定（グローバル状態をチェック）
        const shouldFetchConnpass = connpassEvents.length === 0 || (connpassLastFetch && (now - connpassLastFetch > FIVE_MINUTES));

        // 記事データの取得判定（グローバル状態をチェック）
        const shouldFetchArticles = !publishedArticles || (publishedArticlesLastFetch && (now - publishedArticlesLastFetch > FIVE_MINUTES));

        // どちらも取得不要な場合はスキップ
        if (!shouldFetchConnpass && !shouldFetchArticles) {
            console.log('[PortfolioLinks] Data already available, skipping fetch');
            fetchStartedRef.current = true;
            return;
        }

        // 取得開始フラグを設定（重複実行を防ぐ）
        fetchStartedRef.current = true;

        let cancelled = false;

        // Connpassイベントの取得
        const fetchConnpassEvents = async () => {
            if (!shouldFetchConnpass || cancelled) return;

            try {
                console.log('[PortfolioLinks] Fetching Connpass events...');
                const response = await fetch('/api/connpass', { cache: 'no-store' });
                const data = await response.json();
                if (!cancelled && data.events && data.events.length > 0) {
                    // 日付順にソート
                    const sortedEvents = [...data.events].sort((a, b) => {
                        const dateA = new Date(a.started_at).getTime();
                        const dateB = new Date(b.started_at).getTime();
                        return dateA - dateB;
                    });
                    setConnpassEvents(sortedEvents);
                    setConnpassLastFetch(Date.now());
                    console.log('[PortfolioLinks] Connpass events fetched:', sortedEvents.length);
                }
            } catch (error) {
                console.error('[PortfolioLinks] Error fetching Connpass events:', error);
            }
        };

        // 記事データの取得
        const fetchPublishedArticles = async () => {
            if (!shouldFetchArticles || cancelled) return;

            try {
                console.log('[PortfolioLinks] Fetching published articles...');

                // ピックアップ記事とスクレイピングで取得したLatest Articlesはスクレイピングから取得
                const scrapeRes = await fetch(`/api/qiita-scrape?t=${Date.now()}`, { cache: "no-store" });
                const scrapeJson: {
                    pickupArticles?: Array<{ url: string; title: string; tags: string[] }>;
                    latestArticles?: Array<{ url: string; title: string; tags: string[] }>;
                } = await scrapeRes.json();

                const pickupItems = scrapeJson?.pickupArticles || [];
                const latestItemsFromScrape = scrapeJson?.latestArticles || [];

                // LatestArticlesはQiitaAPIから取得（ピックアップ記事と重複しない最新3件）
                const qiitaApiRes = await fetch(`/api/qiita?page=1&includeTags=1&perPage=10`, { cache: "no-store" });
                const qiitaApiJson: {
                    items?: Array<{
                        url: string;
                        title: string;
                        body?: string;
                        tags: Array<{ name: string }>
                    }>
                } = await qiitaApiRes.json();

                // ピックアップ記事とスクレイピングで取得したLatest ArticlesのURLを取得（重複除外用）
                const pickupUrlsSet = new Set(pickupItems.map(item => item.url));
                const scrapeLatestUrlsSet = new Set(latestItemsFromScrape.map(item => item.url));
                const allExcludedUrlsSet = new Set([...pickupUrlsSet, ...scrapeLatestUrlsSet]);

                // ピックアップ記事とスクレイピングLatest Articlesと重複しない最新記事を取得（最大3件）
                const allApiItems = qiitaApiJson?.items || [];
                const filteredItems = allApiItems.filter(item => !allExcludedUrlsSet.has(item.url));

                const latestItems = filteredItems
                    .slice(0, 3)
                    .map(item => ({
                        url: item.url,
                        title: item.title,
                        tags: item.tags.map(tag => tag.name)
                    }));

                if (!cancelled) {
                    // OGP取得なしで、直接記事データを作成
                    const createArticleData = (items: Array<{ url: string; title: string; tags: string[] }>) => {
                        return items.map((item) => {
                            return {
                                url: item.url,
                                title: item.title || "",
                                description: "",
                                images: [],
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
                    console.log('[PortfolioLinks] Published articles fetched');
                }
            } catch (error) {
                console.error('[PortfolioLinks] Error fetching published articles:', error);
            }
        };

        // 並列で取得（どちらも必要な場合）
        Promise.all([
            shouldFetchConnpass ? fetchConnpassEvents() : Promise.resolve(),
            shouldFetchArticles ? fetchPublishedArticles() : Promise.resolve()
        ]);

        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // マウント時に1回だけ実行（グローバル状態はuseAtomValueで読み取り）

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
                        Engineer • Researcher • Photographer • Community Director
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
