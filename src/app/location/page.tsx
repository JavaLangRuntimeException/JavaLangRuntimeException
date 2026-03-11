"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { HeroBackground } from "../../shared/ui/HeroBackground";
import Link from "next/link";

type LocationMap = Record<string, string>;

const dayNames = ["日", "月", "火", "水", "木", "金", "土"];

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isToday(dateStr: string): boolean {
  return dateStr === formatYMD(new Date());
}

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const dayName = dayNames[date.getDay()];
  return `${month}/${day}（${dayName}）`;
}

export default function LocationPage() {
  const bgImages = ["/image.png", "/image2.png", "/image3.png"];
  const [locations, setLocations] = useState<LocationMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    const fetchLocations = async () => {
      try {
        const res = await fetch("/api/location");
        const data = await res.json();
        if (data.ok) {
          setLocations(data.locations);
        } else {
          setError("データの取得に失敗しました");
        }
      } catch {
        setError("データの取得に失敗しました");
      } finally {
        setLoading(false);
      }
    };
    fetchLocations();
  }, []);

  // カレンダー用: 今日から4週間分の日付を生成
  const weeks = useMemo(() => {
    const today = new Date();
    const monday = getMonday(today);
    const result: Date[][] = [];
    for (let w = 0; w < 4; w++) {
      const week: Date[] = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(monday);
        date.setDate(monday.getDate() + w * 7 + d);
        week.push(date);
      }
      result.push(week);
    }
    return result;
  }, []);

  const displayDate = selectedDate || formatYMD(new Date());
  const displayLocation = locations[displayDate];
  const sortedDates = Object.keys(locations).sort();

  return (
    <HeroBackground images={bgImages} intro={{ enabled: false }}>
      <motion.div
        className="mx-auto max-w-2xl px-4 py-8"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.7 }}
      >
        <motion.h1
          className="mb-4 text-center text-3xl font-bold sm:text-4xl md:text-5xl"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.7 }}
        >
          勤務場所
        </motion.h1>

        <motion.p
          className="mb-2 text-center text-lg text-white/80"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.7 }}
        >
          今日以降の勤務予定場所です
        </motion.p>

        <motion.p
          className="mb-8 text-center text-sm text-white/60"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.7 }}
        >
          <Link href="/reserve" className="text-blue-300 hover:text-blue-200 underline underline-offset-2 transition-colors">
            Ask Me
          </Link>
          ページでの対面でのお問い合わせにご活用ください
        </motion.p>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-white/30 border-t-white" />
          </div>
        ) : error ? (
          <p className="py-8 text-center text-red-300">{error}</p>
        ) : (
          <>
            {/* カレンダー */}
            <motion.div
              className="overflow-hidden rounded-2xl border border-white/20 bg-white/10 backdrop-blur p-4"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.7 }}
            >
              <h2 className="mb-3 text-center text-lg font-semibold text-white">
                {new Date().getFullYear()}年{new Date().getMonth() + 1}月〜
              </h2>

              {/* 曜日ヘッダー */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {dayNames.map((name, i) => (
                  <div
                    key={name}
                    className={`text-center text-xs font-medium py-1 ${
                      i === 0 ? "text-red-300" : i === 6 ? "text-blue-300" : "text-white/60"
                    }`}
                  >
                    {name}
                  </div>
                ))}
              </div>

              {/* 日付グリッド */}
              {weeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 gap-1 mb-1">
                  {week.map((date) => {
                    const dateStr = formatYMD(date);
                    const hasLocation = !!locations[dateStr];
                    const today = isToday(dateStr);
                    const selected = dateStr === displayDate;
                    const isPast = date < new Date(new Date().toISOString().slice(0, 10) + "T00:00:00");

                    return (
                      <button
                        key={dateStr}
                        onClick={() => !isPast && setSelectedDate(dateStr)}
                        disabled={isPast}
                        className={`
                          relative rounded-lg p-1.5 text-center text-sm transition-all
                          ${isPast ? "opacity-30 cursor-not-allowed" : "cursor-pointer hover:bg-white/20"}
                          ${today ? "ring-2 ring-blue-400" : ""}
                          ${selected ? "bg-blue-500/30" : ""}
                          ${hasLocation ? "font-bold text-white" : "text-white/50"}
                        `}
                      >
                        <span className="block">{date.getDate()}</span>
                        {hasLocation && (
                          <span className="block mx-auto mt-0.5 h-1.5 w-1.5 rounded-full bg-orange-400" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}

              {/* 選択中の日付の情報 */}
              <div className="mt-3 rounded-xl bg-white/5 border border-white/10 p-3 min-h-[60px]">
                {displayLocation ? (
                  <div className="text-center">
                    <span className="text-xs text-white/60">
                      {formatDateLabel(displayDate)}
                    </span>
                    <p className="mt-1 text-lg font-bold text-white">{displayLocation}</p>
                  </div>
                ) : (
                  <p className="text-center text-sm text-white/40 pt-2">
                    {isToday(displayDate) ? "今日の勤務場所は未登録です" : "日付をクリックして確認"}
                  </p>
                )}
              </div>

              {/* 色の説明 */}
              <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-white/50">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded ring-2 ring-blue-400" />
                  今日
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded bg-blue-500/30" />
                  選択中
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-orange-400" />
                  勤務場所登録済み
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded opacity-30 bg-white/20" />
                  過去（選択不可）
                </span>
              </div>
            </motion.div>

            {/* リスト表示 */}
            <motion.div
              className="mt-6 overflow-hidden rounded-2xl border border-white/20 bg-white/10 backdrop-blur"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.7 }}
            >
              {sortedDates.length === 0 ? (
                <p className="py-8 text-center text-white/60">
                  勤務場所の登録がありません
                </p>
              ) : (
                <div className="divide-y divide-white/10">
                  {sortedDates.map((date, i) => (
                    <motion.div
                      key={date}
                      className={`flex items-center justify-between px-6 py-4 cursor-pointer transition-colors hover:bg-white/5 ${
                        isToday(date) ? "bg-blue-500/10" : ""
                      } ${date === displayDate ? "bg-white/5" : ""}`}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.6 + i * 0.05, duration: 0.4 }}
                      onClick={() => setSelectedDate(date)}
                    >
                      <div className="flex items-center gap-3">
                        {isToday(date) && (
                          <span className="rounded-full bg-blue-500 px-2 py-0.5 text-xs font-bold text-white">
                            TODAY
                          </span>
                        )}
                        <span className="text-lg font-medium text-white">
                          {formatDateLabel(date)}
                        </span>
                      </div>
                      <span className="text-white/90 font-medium">
                        {locations[date]}
                      </span>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          </>
        )}
      </motion.div>
    </HeroBackground>
  );
}
