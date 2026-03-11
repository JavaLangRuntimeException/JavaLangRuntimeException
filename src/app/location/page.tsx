"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { HeroBackground } from "../../shared/ui/HeroBackground";
import Link from "next/link";

type LocationMap = Record<string, string>;

const dayNames = ["日", "月", "火", "水", "木", "金", "土"];

// 勤務場所 → 緯度経度マッピング
const LOCATION_COORDS: Record<string, { lat: number; lng: number; label: string }> = {
  "滋賀県草津市": { lat: 35.017, lng: 135.961, label: "草津市" },
  "滋賀県（草津市以外）": { lat: 35.1, lng: 136.05, label: "滋賀" },
  "京都府京都市": { lat: 35.012, lng: 135.768, label: "京都市" },
  "京都府（京都市以外）": { lat: 35.15, lng: 135.5, label: "京都" },
  "大阪府大阪市": { lat: 34.686, lng: 135.52, label: "大阪市" },
  "大阪府茨木市": { lat: 34.816, lng: 135.569, label: "茨木市" },
  "大阪府（大阪市・茨木市以外）": { lat: 34.75, lng: 135.45, label: "大阪" },
  "東京都渋谷区": { lat: 35.662, lng: 139.704, label: "渋谷区" },
  "東京都（渋谷区以外）": { lat: 35.689, lng: 139.692, label: "東京" },
  "愛知県名古屋市": { lat: 35.181, lng: 136.906, label: "名古屋市" },
  "愛知県（名古屋市以外）": { lat: 35.1, lng: 137.0, label: "愛知" },
  "岐阜県": { lat: 35.391, lng: 136.722, label: "岐阜" },
};

// 緯度経度 → SVGの座標に変換（簡易射影）
function geoToSvg(lat: number, lng: number): { x: number; y: number } {
  const minLng = 129.5, maxLng = 146.0;
  const minLat = 30.5, maxLat = 45.5;
  const x = ((lng - minLng) / (maxLng - minLng)) * 500;
  const y = ((maxLat - lat) / (maxLat - minLat)) * 400;
  return { x, y };
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
  return date.toISOString().slice(0, 10);
}

function isToday(dateStr: string): boolean {
  return dateStr === formatYMD(new Date());
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

  // 現在地図に表示するピン
  const activeLocations = useMemo(() => {
    const target = selectedDate || formatYMD(new Date());
    const locationName = locations[target];
    if (!locationName) return [];
    return Object.entries(LOCATION_COORDS)
      .filter(([key]) => key === locationName)
      .map(([, coord]) => coord);
  }, [locations, selectedDate]);

  const displayDate = selectedDate || formatYMD(new Date());
  const displayLocation = locations[displayDate];

  return (
    <HeroBackground images={bgImages} intro={{ enabled: false }}>
      <motion.div
        className="mx-auto max-w-4xl px-4 py-8"
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
          <div className="grid gap-6 lg:grid-cols-2">
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
                      {(() => {
                        const d = new Date(displayDate + "T00:00:00");
                        return `${d.getMonth() + 1}/${d.getDate()}（${dayNames[d.getDay()]}）`;
                      })()}
                    </span>
                    <p className="mt-1 text-lg font-bold text-white">{displayLocation}</p>
                  </div>
                ) : (
                  <p className="text-center text-sm text-white/40 pt-2">
                    {isToday(displayDate) ? "今日の勤務場所は未登録です" : "日付をクリックして確認"}
                  </p>
                )}
              </div>
            </motion.div>

            {/* 日本地図 */}
            <motion.div
              className="overflow-hidden rounded-2xl border border-white/20 bg-white/10 backdrop-blur p-4"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.7 }}
            >
              <h2 className="mb-3 text-center text-lg font-semibold text-white">
                {displayLocation || "場所を選択"}
              </h2>

              <svg viewBox="0 0 500 400" className="w-full h-auto">
                {/* 日本列島の簡易パス */}
                {/* 北海道 */}
                <path
                  d="M380,45 Q400,35 420,40 Q440,45 445,60 Q448,75 440,85 Q430,95 415,90 Q400,95 390,85 Q380,75 375,60 Q375,50 380,45Z"
                  fill="white" fillOpacity="0.1" stroke="white" strokeOpacity="0.3" strokeWidth="1"
                />
                {/* 本州 */}
                <path
                  d="M350,95 Q370,90 380,100 Q385,110 375,120 Q365,125 360,140 Q355,155 340,165 Q325,175 310,180 Q295,185 280,195 Q265,200 250,210 Q240,218 225,225 Q210,230 195,228 Q180,225 170,215 Q165,205 170,195 Q180,190 190,185 Q200,178 195,165 Q190,155 195,145 Q205,140 215,145 Q225,150 235,145 Q240,138 235,130 Q225,125 220,115 Q225,105 240,100 Q255,95 270,100 Q285,105 300,100 Q315,95 330,92 Q340,90 350,95Z"
                  fill="white" fillOpacity="0.1" stroke="white" strokeOpacity="0.3" strokeWidth="1"
                />
                {/* 四国 */}
                <path
                  d="M175,230 Q195,225 210,230 Q220,235 215,245 Q205,252 190,250 Q175,248 170,240 Q170,233 175,230Z"
                  fill="white" fillOpacity="0.1" stroke="white" strokeOpacity="0.3" strokeWidth="1"
                />
                {/* 九州 */}
                <path
                  d="M130,230 Q145,220 155,225 Q162,235 158,250 Q155,265 145,275 Q135,280 125,270 Q118,258 120,245 Q122,235 130,230Z"
                  fill="white" fillOpacity="0.1" stroke="white" strokeOpacity="0.3" strokeWidth="1"
                />

                {/* 登録済みの全場所を薄く表示 */}
                {Object.values(locations).map((loc, i) => {
                  const coord = LOCATION_COORDS[loc];
                  if (!coord) return null;
                  const { x, y } = geoToSvg(coord.lat, coord.lng);
                  return (
                    <circle
                      key={`bg-${i}`}
                      cx={x} cy={y} r="4"
                      fill="white" fillOpacity="0.15"
                    />
                  );
                })}

                {/* 選択日のピン */}
                {activeLocations.map((coord, i) => {
                  const { x, y } = geoToSvg(coord.lat, coord.lng);
                  return (
                    <g key={`pin-${i}`}>
                      {/* パルスエフェクト */}
                      <circle cx={x} cy={y} r="12" fill="none" stroke="#f97316" strokeWidth="1.5" opacity="0.4">
                        <animate attributeName="r" values="8;18;8" dur="2s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite" />
                      </circle>
                      {/* ピン本体 */}
                      <circle cx={x} cy={y} r="6" fill="#f97316" stroke="white" strokeWidth="2" />
                      {/* ラベル */}
                      <text
                        x={x} y={y - 14}
                        textAnchor="middle"
                        fill="white"
                        fontSize="11"
                        fontWeight="bold"
                        style={{ textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}
                      >
                        {coord.label}
                      </text>
                    </g>
                  );
                })}

                {/* リモート等のピン無し表示 */}
                {displayLocation && !activeLocations.length && (
                  <text
                    x="250" y="200"
                    textAnchor="middle"
                    fill="white"
                    fontSize="16"
                    fontWeight="bold"
                    opacity="0.8"
                  >
                    {displayLocation}
                  </text>
                )}
              </svg>
            </motion.div>
          </div>
        )}
      </motion.div>
    </HeroBackground>
  );
}
