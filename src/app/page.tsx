"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ProfileHeader } from "../feature/profile/ui/profile-header";
import { AffiliationBadges } from "../feature/affiliations/ui/badges";

/**
 * マウスホバーでカードが回転し、背景にパララックス効果をかけるサンプル。
 * Next.jsやルーティングが不要なシンプルな単一Reactコンポーネントです。
 * TailwindCSSでの実装を想定しています。
 *
 * カードが初期から裏面で表示される問題を解消するために、
 * 「カードのコンテナ(.card-inner)をホバー時に回転させる」実装に変更しています。
 */

export default function PortfolioLinks() {
  const [scrollY, setScrollY] = useState(0);
  const [showIntro, setShowIntro] = useState(true);
  const bgImages = ["/image.png", "/image2.png", "/image3.png"];
  const [bgIndex, setBgIndex] = useState(0);

  // スクロールでパララックス用の値を更新
  useEffect(() => {
    function handleScroll() {
      setScrollY(window.scrollY || window.pageYOffset);
    }
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Intro animation once on first visit
  useEffect(() => {
    const timer = setTimeout(() => setShowIntro(false), 1200);
    return () => clearTimeout(timer);
  }, []);

  // 5秒ごとに背景を切り替え
  useEffect(() => {
    const interval = setInterval(() => {
      setBgIndex((idx) => (idx + 1) % bgImages.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [bgImages.length]);
  // moved to feature/links

  return (
      <div className="relative min-h-screen overflow-hidden text-white">
        {/* 背景（クロスフェード） */}
        <div className="absolute inset-0 -z-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={bgIndex}
              className="absolute inset-0"
              style={{
                backgroundImage: `url(${bgImages[bgIndex]})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8 }}
            />
          </AnimatePresence>
        </div>
        {/* Intro Overlay */}
        <AnimatePresence>
          {showIntro && (
            <motion.div
              className="fixed inset-0 z-50 grid place-items-center bg-black"
              initial={{ opacity: 1 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 1.05, opacity: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="text-center"
              >
                <div className="text-2xl font-semibold tracking-wide text-white">JavaLangRuntimeException</div>
                <div className="mt-2 text-sm text-zinc-300">Loading portfolio...</div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* パララックス用のダークオーバーレイ */}
        <div
            className="pointer-events-none absolute inset-0"
            style={{
              transform: `translateY(${scrollY * 0.2}px)`,
              background: "linear-gradient(to bottom, rgba(0,0,0,0.55), rgba(0,0,0,0.75))",
            }}
        />

        <div className="relative z-10 max-w-5xl mx-auto px-4 py-16">
          <motion.h1
              className="text-center text-3xl sm:text-4xl md:text-5xl font-bold mb-6"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.7 }}
          >
            taramanji (JavaLangRuntimeException)
          </motion.h1>
          <motion.h2
              className="text-center text-xl sm:text-2xl md:text-3xl mb-12"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.7 }}
          >
            ポートフォリオ
          </motion.h2>

          <div className="mx-auto max-w-4xl">
            <ProfileHeader />
            <AffiliationBadges />
          </div>
        </div>
      </div>
  );
}
