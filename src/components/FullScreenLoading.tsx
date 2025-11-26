"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export function FullScreenLoading({ title, subtitle = "Loading...", variant = "overlay", onDataLoaded }: {
  title?: string;
  subtitle?: string;
  variant?: "overlay" | "page";
  onDataLoaded?: () => void;
}) {
  const letters = Array.from(title || "");
  const [isVisible, setIsVisible] = useState(true);
  const [dataLoaded, setDataLoaded] = useState(false);

  // ヘッダーの直近予約可能時間が読み込まれたかチェック
  useEffect(() => {
    const checkDataLoaded = () => {
      // ヘッダーのマーキー要素をチェック
      const marqueeElement = document.querySelector('.marquee-track');
      if (marqueeElement) {
        const text = marqueeElement.textContent || '';
        // "取得中…" でない場合はデータが読み込まれたと判断
        if (!text.includes('取得中…') && text.length > 0) {
          setDataLoaded(true);
          if (onDataLoaded) onDataLoaded();
        }
      }
    };

    // 初回チェック
    checkDataLoaded();

    // 定期的にチェック
    const interval = setInterval(checkDataLoaded, 500);

    // 最大10秒でタイムアウト
    const timeout = setTimeout(() => {
      setDataLoaded(true);
      if (onDataLoaded) onDataLoaded();
    }, 10000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [onDataLoaded]);

  // データが読み込まれたらフェードアウト
  useEffect(() => {
    if (dataLoaded) {
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 1000); // 1秒後にフェードアウト開始
      return () => clearTimeout(timer);
    }
  }, [dataLoaded]);

  if (!isVisible) return null;

  return (
    <motion.div
      className={variant === "overlay" ? "fixed inset-0 z-[9999] grid place-items-center bg-black overscroll-none" : "min-h-screen w-full grid place-items-center bg-black"}
      initial={{ opacity: 1 }}
      animate={{ opacity: dataLoaded ? 0 : 1 }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 0.8, ease: "easeInOut" }}
    >
      {/* Enhanced ambient gradients with more dynamic colors */}
      <motion.div
        className="pointer-events-none absolute -top-1/3 -left-1/3 h-[80vh] w-[80vh] rounded-full blur-3xl opacity-20"
        style={{ background: "radial-gradient(circle at center, rgba(59,130,246,0.1), transparent 60%)" }}
        animate={{
          scale: [1, 1.05, 1],
          opacity: [0.2, 0.3, 0.2],
          x: [-10, 10, -10],
          y: [-10, 10, -10],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />
      <motion.div
        className="pointer-events-none absolute -bottom-1/3 -right-1/3 h-[80vh] w-[80vh] rounded-full blur-3xl opacity-20"
        style={{ background: "radial-gradient(circle at center, rgba(16,185,129,0.1), transparent 60%)" }}
        animate={{
          scale: [1.02, 1, 1.02],
          opacity: [0.2, 0.3, 0.2],
          x: [10, -10, 10],
          y: [10, -10, 10],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 2
        }}
      />
      <motion.div
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[60vh] w-[60vh] rounded-full blur-3xl opacity-15"
        style={{ background: "radial-gradient(circle at center, rgba(168,85,247,0.08), transparent 60%)" }}
        animate={{
          scale: [1, 1.05, 1],
          opacity: [0.15, 0.25, 0.15],
          rotate: [0, 360],
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: "linear"
        }}
      />

      {/* 追加のグロー効果 */}
      <motion.div
        className="pointer-events-none absolute top-1/4 right-1/4 h-[40vh] w-[40vh] rounded-full blur-2xl opacity-20"
        style={{ background: "radial-gradient(circle at center, rgba(236,72,153,0.1), transparent 60%)" }}
        animate={{
          scale: [0.98, 1.02, 0.98],
          opacity: [0.15, 0.25, 0.15],
          x: [5, -5, 5],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 1
        }}
      />

      <motion.div
        initial={{ scale: 0.8, opacity: 0, y: 50 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 1.2, opacity: 0, y: -50 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative text-center"
        role="status"
        aria-live="polite"
      >
        {/* Enhanced rotating rings with more layers */}
        <div className="relative mx-auto mb-8 h-24 w-24 sm:h-28 sm:w-28">
          <div className="absolute inset-0 rounded-full border-2 border-white/20" />
          <div className="absolute inset-0 rounded-full border-t-2 border-r-2 border-white/80 animate-spin" style={{ animationDuration: "1s" }} />
          <div className="absolute inset-2 rounded-full border-t-2 border-l-2 border-white/50 animate-spin" style={{ animationDuration: "1.5s" }} />
          <div className="absolute inset-4 rounded-full border-t-2 border-r-2 border-white/30 animate-spin" style={{ animationDuration: "2s" }} />
          {/* Central pulsing dot */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-white/90 animate-pulse" />
        </div>

        {/* Enhanced title with more dramatic effects */}
        <div className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-wider relative">
          {/* タイトル背景のグロー効果 */}
          <motion.div
            className="absolute inset-0 blur-2xl opacity-10"
            style={{
              background: "linear-gradient(135deg, #3b82f6, #8b5cf6, #ec4899)",
            }}
            animate={{
              scale: [1, 1.02, 1],
              opacity: [0.1, 0.15, 0.1],
              rotate: [0, 180, 360],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />

          {/* メインタイトル */}
          <div className="relative bg-gradient-to-r from-white via-blue-200 to-purple-200 bg-clip-text text-transparent">
            {letters.map((ch, i) => (
              <motion.span
                key={`${ch}-${i}`}
                initial={{ y: 50, opacity: 0, rotateX: 90, scale: 0 }}
                animate={{
                  y: [0, -8, 0],
                  opacity: 1,
                  rotateX: 0,
                  scale: [1, 1.1, 1],
                  rotateY: [0, 10, -10, 0],
                }}
                transition={{
                  duration: 2.5,
                  delay: i * 0.1,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="inline-block"
                style={{ transformStyle: "preserve-3d" }}
              >
                {ch === " " ? "\u00A0" : ch}
              </motion.span>
            ))}
          </div>

          {/* タイトル周りのパーティクル */}
          {letters.map((_, i) => (
            <motion.div
              key={`particle-${i}`}
              className="absolute w-1 h-1 bg-white/60 rounded-full"
              style={{
                left: `${20 + (i * 60 / letters.length)}%`,
                top: `${-10 + (i % 2) * 20}%`,
              }}
              animate={{
                y: [-20, 20, -20],
                opacity: [0.3, 1, 0.3],
                scale: [0.5, 1.5, 0.5],
                rotate: [0, 360],
              }}
              transition={{
                duration: 3 + i * 0.2,
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * 0.1,
              }}
            />
          ))}
        </div>

        {/* Enhanced subtitle with wave animation */}
        <motion.div
          className="mt-4 text-base sm:text-lg text-zinc-300/90 flex items-center justify-center gap-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.8 }}
        >
          <span>{subtitle.replace(/\.*$/, "")}</span>
          <motion.span
            initial={{ opacity: 0.3 }}
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            .
          </motion.span>
          <motion.span
            initial={{ opacity: 0.3 }}
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }}
          >
            .
          </motion.span>
          <motion.span
            initial={{ opacity: 0.3 }}
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.5, repeat: Infinity, delay: 0.6 }}
          >
            .
          </motion.span>
        </motion.div>

        {/* Enhanced glass card glow with multiple layers */}
        <div className="pointer-events-none absolute -inset-x-12 -bottom-12 h-16 blur-3xl bg-white/20" />
        <div className="pointer-events-none absolute -inset-x-8 -bottom-8 h-12 blur-2xl bg-blue-500/10" />

        {/* Floating particles effect */}
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-white/60 rounded-full"
            style={{
              left: `${20 + i * 15}%`,
              top: `${30 + (i % 3) * 20}%`,
            }}
            animate={{
              y: [-20, 20, -20],
              opacity: [0.3, 1, 0.3],
              scale: [0.5, 1, 0.5],
            }}
            transition={{
              duration: 3 + i * 0.5,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.3,
            }}
          />
        ))}
      </motion.div>
    </motion.div>
  );
}


