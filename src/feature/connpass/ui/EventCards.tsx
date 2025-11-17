"use client";

import React, {useEffect, useState} from "react";
import {motion} from "framer-motion";
import {useAtom} from "jotai";
import {connpassEventsAtom} from "../../../components/BackgroundFetcher";

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
    image_url?: string;
}

export const ConnpassEventCards: React.FC<{ showAnimations?: boolean; delay?: number }> = ({
                                                                                               showAnimations = true,
                                                                                               delay = 0
                                                                                           }) => {
    const [globalEvents] = useAtom(connpassEventsAtom);
    // 日付順にソートする関数
    const sortEventsByDate = React.useCallback((events: ConnpassEvent[]) => {
        return [...events].sort((a, b) => {
            const dateA = new Date(a.started_at).getTime();
            const dateB = new Date(b.started_at).getTime();
            return dateA - dateB; // 昇順（古い順から新しい順）
        });
    }, []);
    const [events, setEvents] = useState<ConnpassEvent[]>(() => sortEventsByDate(globalEvents));
    const [loading, setLoading] = useState(globalEvents.length === 0);

    // グローバル状態からデータを同期（データ取得はpage.tsxで行うため、ここでは表示のみ）
    useEffect(() => {
        if (globalEvents.length > 0) {
            const sortedEvents = sortEventsByDate(globalEvents);
            setEvents(sortedEvents);
            setLoading(false);
        } else {
            // グローバル状態にデータがない場合はローディング状態を維持
            setLoading(true);
        }
    }, [globalEvents, sortEventsByDate]);

    // 見出しは常に表示するため、ここでは非表示にしない

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <motion.div
            className="mt-16"
            initial={showAnimations ? {opacity: 0, y: 30} : {opacity: 1, y: 0}}
            animate={{opacity: 1, y: 0}}
            transition={showAnimations ? {delay, duration: 0.6} : {duration: 0}}
        >
            <h2 className="text-lg font-semibold">📅 Organized Events</h2>
            {loading && (
                <div className="mt-4 flex items-center justify-center gap-3">
                    <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-green-400"></div>
                    <p className="text-sm text-zinc-400">イベント取得中...</p>
                </div>
            )}

            {!loading && events.length === 0 && (
                <p className="mt-2 text-sm text-zinc-400">直近の主催イベントはありません</p>
            )}

            {!loading && events.length > 0 && (
            <div className="grid gap-6 sm:grid-cols-1 mt-3">
                {events.map((event, index) => (
                    <motion.a
                        key={event.event_id}
                        href={event.event_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group relative rounded-xl border border-white/10 overflow-hidden transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-blue-500/20"
                        initial={showAnimations ? {opacity: 0, y: 20} : {opacity: 1, y: 0}}
                        animate={{opacity: 1, y: 0}}
                        transition={showAnimations ? {delay: delay + 0.3 + index * 0.1, duration: 0.5} : {duration: 0}}
                        whileHover={{scale: 1.02}}
                        whileTap={{scale: 0.98}}
                    >
                        {/* 背景画像 */}
                        {event.image_url && (
                            <div
                                className="absolute inset-0 bg-cover bg-center opacity-30 group-hover:opacity-40 transition-opacity duration-300"
                                style={{backgroundImage: `url(${event.image_url})`}}
                            />
                        )}

                        {/* グラデーションオーバーレイ */}
                        <div
                            className="absolute inset-0 bg-gradient-to-br from-black/40 via-black/50 to-black/60 backdrop-blur-sm"/>

                        {/* コンテンツ */}
                        <div className="relative p-6">
                            <div className="flex items-start gap-3 mb-3">
                                <div className="w-2 h-2 mt-2 rounded-full bg-blue-400 animate-pulse flex-shrink-0"/>
                                <h3 className="text-lg font-semibold text-white group-hover:text-blue-300 transition-colors line-clamp-2 drop-shadow-lg">
                                    {event.title}
                                </h3>
                            </div>

                            <div className="space-y-2 text-sm">
                                <div className="flex items-center gap-2 text-white/90 drop-shadow">
                                    <span>📍</span>
                                    <span className="line-clamp-1">{event.place}</span>
                                </div>
                                <div className="flex items-center gap-2 text-white/90 drop-shadow">
                                    <span>🕐</span>
                                    <span>{formatDate(event.started_at)}</span>
                                </div>
                                <div className="flex items-center gap-2 text-white/90 drop-shadow">
                                    <span>👥</span>
                                    <span>
                                        参加者: {event.accepted}/{event.limit || '∞'}
                                        {event.waiting > 0 && ` (補欠: ${event.waiting})`}
                                    </span>
                                </div>
                            </div>

                            <div
                                className="mt-4 flex items-center text-blue-400 group-hover:text-blue-300 transition-colors drop-shadow-lg">
                                <span className="text-sm font-semibold">詳細を見る</span>
                                <motion.span
                                    className="ml-2"
                                    animate={{x: [0, 5, 0]}}
                                    transition={{duration: 1.5, repeat: Infinity}}
                                >
                                    →
                                </motion.span>
                            </div>
                        </div>
                    </motion.a>
                ))}
            </div>
            )}
        </motion.div>
    );
};
