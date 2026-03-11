"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { HeroBackground } from "../../shared/ui/HeroBackground";

type LocationMap = Record<string, string>;

const dayNames = ["日", "月", "火", "水", "木", "金", "土"];

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const dayName = dayNames[date.getDay()];
  return `${month}/${day}（${dayName}）`;
}

function isToday(dateStr: string): boolean {
  const today = new Date();
  return dateStr === today.toISOString().slice(0, 10);
}

export default function LocationPage() {
  const bgImages = ["/image.png", "/image2.png", "/image3.png"];
  const [locations, setLocations] = useState<LocationMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          className="mb-6 text-center text-3xl font-bold sm:text-4xl md:text-5xl"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.7 }}
        >
          勤務場所
        </motion.h1>

        <motion.p
          className="mb-8 text-center text-lg text-white/80"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.7 }}
        >
          今日以降の勤務予定場所です
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.7 }}
        >
          <div className="overflow-hidden rounded-2xl border border-white/20 bg-white/10 backdrop-blur">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-white/30 border-t-white" />
              </div>
            ) : error ? (
              <p className="py-8 text-center text-red-300">{error}</p>
            ) : sortedDates.length === 0 ? (
              <p className="py-8 text-center text-white/60">
                勤務場所の登録がありません
              </p>
            ) : (
              <div className="divide-y divide-white/10">
                {sortedDates.map((date, i) => (
                  <motion.div
                    key={date}
                    className={`flex items-center justify-between px-6 py-4 ${
                      isToday(date) ? "bg-blue-500/10" : ""
                    }`}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + i * 0.05, duration: 0.4 }}
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
          </div>
        </motion.div>
      </motion.div>
    </HeroBackground>
  );
}
