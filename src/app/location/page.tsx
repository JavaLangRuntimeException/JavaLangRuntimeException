"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { HeroBackground } from "../../shared/ui/HeroBackground";
import Link from "next/link";

type LocationMap = Record<string, string>;

const dayNames = ["月", "火", "水", "木", "金", "土", "日"];

// 場所ごとの色・漢字1文字マッピング
const LOCATION_STYLES: Record<string, { dot: string; text: string; char: string }> = {
  "滋賀県草津市":           { dot: "bg-emerald-400", text: "text-emerald-300", char: "草" },
  "滋賀県（草津市以外）":     { dot: "bg-emerald-600", text: "text-emerald-400", char: "滋" },
  "京都府京都市":           { dot: "bg-purple-400",  text: "text-purple-300",  char: "京" },
  "京都府（京都市以外）":     { dot: "bg-purple-600",  text: "text-purple-400",  char: "都" },
  "大阪府大阪市":           { dot: "bg-orange-400",  text: "text-orange-300",  char: "阪" },
  "大阪府茨木市":           { dot: "bg-amber-400",   text: "text-amber-300",   char: "茨" },
  "大阪府（大阪市・茨木市以外）": { dot: "bg-orange-600", text: "text-orange-400", char: "大" },
  "東京都渋谷区":           { dot: "bg-red-400",     text: "text-red-300",     char: "渋" },
  "東京都（渋谷区以外）":     { dot: "bg-red-600",     text: "text-red-400",     char: "東" },
  "愛知県名古屋市":         { dot: "bg-blue-400",    text: "text-blue-300",    char: "名" },
  "愛知県（名古屋市以外）":   { dot: "bg-blue-600",    text: "text-blue-400",    char: "愛" },
  "岐阜県":               { dot: "bg-lime-400",    text: "text-lime-300",    char: "岐" },
  "リモート":              { dot: "bg-cyan-400",    text: "text-cyan-300",    char: "リ" },
  "複数箇所（お問い合わせください）": { dot: "bg-pink-400", text: "text-pink-300", char: "複" },
  "未定（お問い合わせください）": { dot: "bg-gray-400",   text: "text-gray-400",   char: "？" },
  "対応不可日・休日":        { dot: "bg-rose-400",    text: "text-rose-300",   char: "休" },
};

const DEFAULT_STYLE = { dot: "bg-white", text: "text-white/80", char: "・" };

function getLocationStyle(location: string) {
  return LOCATION_STYLES[location] || DEFAULT_STYLE;
}

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

const dayNamesJP = ["日", "月", "火", "水", "木", "金", "土"];

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const dayName = dayNamesJP[date.getDay()];
  return `${month}/${day}（${dayName}）`;
}

export default function LocationPage() {
  const bgImages = ["/image.png", "/image2.png", "/image3.png"];
  const [locations, setLocations] = useState<LocationMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [monthOffset, setMonthOffset] = useState(0);

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

  // カレンダー用: 表示月の週を生成（月曜始まり）
  const calendarMonth = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + monthOffset;
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // 月曜始まりで最初の日を求める（0=日,1=月,...6=土 → 月曜=0にする）
    const startDow = (firstDay.getDay() + 6) % 7; // 月=0, 火=1, ..., 日=6
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - startDow);

    const weeks: Date[][] = [];
    const cursor = new Date(startDate);
    while (cursor <= lastDay || weeks.length === 0 || weeks[weeks.length - 1].length < 7) {
      if (weeks.length === 0 || weeks[weeks.length - 1].length === 7) {
        if (weeks.length > 0 && cursor > lastDay) break;
        weeks.push([]);
      }
      weeks[weeks.length - 1].push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    // 最後の週を7日に埋める
    while (weeks[weeks.length - 1].length < 7) {
      weeks[weeks.length - 1].push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    return {
      year: firstDay.getFullYear(),
      month: firstDay.getMonth() + 1,
      weeks,
    };
  }, [monthOffset]);

  const canGoPrev = monthOffset > 0;

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
          className="mb-2 text-center text-sm text-white/60"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.43, duration: 0.7 }}
        >
          最短2ヶ月先まで公開しています
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
              <div className="mb-3 flex items-center justify-center gap-3">
                <button
                  onClick={() => setMonthOffset((p) => p - 1)}
                  disabled={!canGoPrev}
                  className="px-2 py-1 text-white/70 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-lg"
                >
                  ←
                </button>
                <h2 className="text-center text-lg font-semibold text-white min-w-[120px]">
                  {calendarMonth.year}年{calendarMonth.month}月
                </h2>
                <button
                  onClick={() => setMonthOffset((p) => p + 1)}
                  className="px-2 py-1 text-white/70 hover:text-white transition-colors text-lg"
                >
                  →
                </button>
                {monthOffset !== 0 && (
                  <button
                    onClick={() => setMonthOffset(0)}
                    className="ml-1 px-3 py-1 text-xs bg-white/10 hover:bg-white/20 text-white/70 hover:text-white rounded-lg transition-colors"
                  >
                    今月
                  </button>
                )}
              </div>

              {/* 曜日ヘッダー（月曜始まり） */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {dayNames.map((name) => (
                  <div
                    key={name}
                    className={`text-center text-xs font-medium py-1 ${
                      name === "日" ? "text-red-300" : name === "土" ? "text-blue-300" : "text-white/60"
                    }`}
                  >
                    {name}
                  </div>
                ))}
              </div>

              {/* 日付グリッド */}
              {calendarMonth.weeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 gap-1 mb-1">
                  {week.map((date) => {
                    const dateStr = formatYMD(date);
                    const locationName = locations[dateStr];
                    const hasLocation = !!locationName;
                    const today = isToday(dateStr);
                    const selected = dateStr === displayDate;
                    const todayStr = formatYMD(new Date());
                    const isPast = dateStr < todayStr;
                    const isCurrentMonth = date.getMonth() + 1 === calendarMonth.month;
                    const style = hasLocation ? getLocationStyle(locationName) : null;

                    return (
                      <button
                        key={dateStr}
                        onClick={() => !isPast && setSelectedDate(dateStr)}
                        disabled={isPast}
                        className={`
                          relative rounded-lg p-1 text-center transition-all
                          ${!isCurrentMonth ? "opacity-20" : ""}
                          ${isPast && isCurrentMonth ? "opacity-30 cursor-not-allowed" : ""}
                          ${!isPast ? "cursor-pointer hover:bg-white/20" : "cursor-not-allowed"}
                          ${today ? "ring-2 ring-blue-400" : ""}
                          ${selected ? "bg-blue-500/30" : ""}
                          ${hasLocation ? "font-bold text-white" : "text-white/50"}
                        `}
                      >
                        <span className="block text-sm">{date.getDate()}</span>
                        {hasLocation && style && isCurrentMonth && (
                          <span className={`block text-[10px] leading-tight ${style.text}`}>
                            {style.char}
                          </span>
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
                    <p className={`mt-1 text-lg font-bold ${getLocationStyle(displayLocation).text}`}>
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${getLocationStyle(displayLocation).dot} mr-2 align-middle`} />
                      {displayLocation}
                    </p>
                  </div>
                ) : (
                  <p className="text-center text-sm text-white/40 pt-2">
                    {isToday(displayDate) ? "今日の勤務場所は未登録です" : "日付をクリックして確認"}
                  </p>
                )}
              </div>

              {/* 色の説明 */}
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-white/50">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3 rounded ring-2 ring-blue-400" />
                    今日
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3 rounded bg-blue-500/30" />
                    選択中
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3 rounded opacity-30 bg-white/20" />
                    過去（選択不可）
                  </span>
                </div>
                {/* 場所ごとの色凡例 */}
                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-white/50">
                  {Object.entries(LOCATION_STYLES).map(([name, s]) => (
                    <span key={name} className="flex items-center gap-1">
                      <span className={`inline-block w-3.5 text-center font-bold ${s.text}`}>{s.char}</span>
                      {name}
                    </span>
                  ))}
                </div>
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
                      <span className="flex items-center gap-2">
                        <span className={`inline-block h-2 w-2 rounded-full ${getLocationStyle(locations[date]).dot}`} />
                        <span className={`font-medium ${getLocationStyle(locations[date]).text}`}>
                          {locations[date]}
                        </span>
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
