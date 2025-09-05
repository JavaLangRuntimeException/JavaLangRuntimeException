"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ProfileHeader } from "../feature/profile/ui/profile-header";
import { AffiliationBadges } from "../feature/affiliations/ui/badges";
import { FullScreenLoading } from "../components/FullScreenLoading";

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

  // Intro animation only on first visit per session
  useEffect(() => {
    const flag = sessionStorage.getItem("intro_shown");
    if (flag === "1") {
      setShowIntro(false);
      return;
    }
    const timer = setTimeout(() => {
      setShowIntro(false);
      sessionStorage.setItem("intro_shown", "1");
    }, 1200);
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
        <AnimatePresence>{showIntro && <FullScreenLoading title="taramanji" subtitle="Welcome" />}</AnimatePresence>
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
            taramanji
          </motion.h1>
          <motion.h2
              className="text-center text-xl sm:text-2xl md:text-3xl mb-12"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.7 }}
          >
          </motion.h2>

          <div className="mx-auto max-w-4xl">
            <ProfileHeader />
            <AffiliationBadges />
          </div>

          {/* Intro to key pages */}
          <div className="mt-10 grid gap-4 sm:grid-cols-2 max-w-4xl mx-auto">
            <a href="/link" className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur hover:bg-white/10 transition">
              <h3 className="text-base font-semibold">Links/Contact</h3>
              <p className="mt-1 text-sm text-zinc-200/90">プロフィール・SNSのリンク一覧。お問い合わせはこちらから。</p>
            </a>
            <a href="/reserve" className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur hover:bg-white/10 transition">
              <h3 className="text-base font-semibold">Reserve</h3>
              <p className="mt-1 text-sm text-zinc-200/90">1on1予約ページ。ご希望の日時を選択してください。</p>
            </a>
          </div>
        </div>
      </div>
  );
}
