"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ProfileHeader } from "../feature/profile/ui/profile-header";
import { AffiliationBadges } from "../feature/affiliations/ui/badges";
import { HeroBackground } from "../shared/ui/HeroBackground";
import { SkillBadges } from "../feature/skills/ui/SkillBadges";
import { useIntro } from "../shared/contexts/IntroContext";


export default function PortfolioLinks() {
  const bgImages = ["/image.png", "/image2.png", "/image3.png"];
  const [showAnimations, setShowAnimations] = useState(false);
  const { showIntro, introCompleted, setIntroCompleted } = useIntro();

  useEffect(() => {
    // 内部ナビゲーションかどうかをチェック
    const isInternalNavigation = sessionStorage.getItem('internal_navigation') === 'true';
    const introShown = sessionStorage.getItem('intro_shown') === '1';

    // 内部ナビゲーションの場合、またはイントロが既に表示済みの場合はアニメーションを無効化
    if (isInternalNavigation || introShown) {
      setShowAnimations(false);
    }
  }, []);

  // プログレス完了時のコールバック（プロフィールアニメーションの準備）
  const handleProgressComplete = () => {
    // プログレス完了時は何もしない（イントロ完了まで待機）
  };

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
          <div className="fixed inset-0 bg-black z-10" />
        )}
        {/* ダイナミックなタイトルアニメーション */}
        {introCompleted && (
          <motion.div
            className="text-center mb-12"
            initial={showAnimations ? { scale: 0.9, opacity: 0 } : { scale: 1, opacity: 1 }}
            animate={{
              scale: 1,
              opacity: 1
            }}
            transition={showAnimations ? {
              duration: 0.6,
              delay: 0.2,
              ease: "easeOut"
            } : { duration: 0 }}
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
            initial={showAnimations ? { opacity: 0, y: 20 } : { opacity: 1, y: 0 }}
            animate={{ opacity: 1, y: 0 }}
            transition={showAnimations ? { delay: 0.4, duration: 0.6 } : { duration: 0 }}
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
            initial={showAnimations ? { opacity: 0, y: 50 } : { opacity: 1, y: 0 }}
            animate={{ opacity: 1, y: 0 }}
            transition={showAnimations ? { delay: 0.6, duration: 0.7 } : { duration: 0 }}
          >
          <motion.div
            initial={showAnimations ? { scale: 0.9, opacity: 0 } : { scale: 1, opacity: 1 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={showAnimations ? { delay: 0.8, duration: 0.6 } : { duration: 0 }}
          >
            <ProfileHeader />
          </motion.div>

          {/* ナビゲーションカード */}
          <motion.div
            className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            initial={showAnimations ? { opacity: 0, y: 30 } : { opacity: 1, y: 0 }}
            animate={{ opacity: 1, y: 0 }}
            transition={showAnimations ? { delay: 1.0, duration: 0.6 } : { duration: 0 }}
          >
            <motion.a
              href="/link"
              className="group rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur transition-all duration-300 hover:bg-white/10 hover:scale-105"
              whileHover={{
                scale: 1.02
              }}
              whileTap={{ scale: 0.98 }}
            >
              <motion.div
                className="flex items-center gap-3 mb-2"
                whileHover={{ x: 5 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                <h3 className="text-lg font-semibold text-white group-hover:text-blue-300 transition-colors">
                  Links
                </h3>
              </motion.div>
              <p className="text-sm text-zinc-200/90 group-hover:text-white/90 transition-colors">
                プロフィール・SNSのリンク一覧
              </p>
            </motion.a>

            <motion.a
              href="/contact"
              className="group rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur transition-all duration-300 hover:bg-white/10 hover:scale-105 hover:shadow-xl hover:shadow-green-500/10"
              whileHover={{
                scale: 1.02,
                boxShadow: "0 10px 20px rgba(34, 197, 94, 0.1)"
              }}
              whileTap={{ scale: 0.98 }}
            >
              <motion.div
                className="flex items-center gap-3 mb-2"
                whileHover={{ x: 5 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <h3 className="text-lg font-semibold text-white group-hover:text-green-300 transition-colors">
                  Contact
                </h3>
              </motion.div>
              <p className="text-sm text-zinc-200/90 group-hover:text-white/90 transition-colors">
                お問い合わせフォーム<br />ご質問・ご相談はこちらから
              </p>
            </motion.a>

            <motion.a
              href="/reserve"
              className="group rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur transition-all duration-300 hover:bg-white/10 hover:scale-105 hover:shadow-xl hover:shadow-purple-500/10"
              whileHover={{
                scale: 1.02,
                boxShadow: "0 10px 20px rgba(139, 92, 246, 0.1)"
              }}
              whileTap={{ scale: 0.98 }}
            >
              <motion.div
                className="flex items-center gap-3 mb-2"
                whileHover={{ x: 5 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                <h3 className="text-lg font-semibold text-white group-hover:text-purple-300 transition-colors">
                  Ask Me
                </h3>
              </motion.div>
              <p className="text-sm text-zinc-200/90 group-hover:text-white/90 transition-colors">
                ご相談・面談予約ページ<br />ご希望の日時を選択してください
              </p>
            </motion.a>
          </motion.div>

          <motion.div
            initial={showAnimations ? { opacity: 0, y: 30 } : { opacity: 1, y: 0 }}
            animate={{ opacity: 1, y: 0 }}
            transition={showAnimations ? { delay: 1.2, duration: 0.6 } : { duration: 0 }}
          >
            <AffiliationBadges />
          </motion.div>
          </motion.div>
        )}

        {introCompleted && (
          <motion.div
            className="max-w-4xl mx-auto"
            initial={showAnimations ? { opacity: 0, y: 30 } : { opacity: 1, y: 0 }}
            animate={{ opacity: 1, y: 0 }}
            transition={showAnimations ? { delay: 1.4, duration: 0.6 } : { duration: 0 }}
          >
            <SkillBadges />
          </motion.div>
        )}

        {/* フローティングパーティクルエフェクト */}
        {introCompleted && (
          <div className="fixed inset-0 pointer-events-none overflow-hidden">
          {[
            { left: 5, top: 10, duration: 8, delay: 0 },
            { left: 15, top: 30, duration: 9, delay: 0.5 },
            { left: 25, top: 50, duration: 10, delay: 1 },
            { left: 35, top: 70, duration: 11, delay: 1.5 },
            { left: 45, top: 20, duration: 9.5, delay: 2 },
            { left: 55, top: 40, duration: 8.5, delay: 2.5 },
            { left: 65, top: 60, duration: 10.5, delay: 3 },
            { left: 75, top: 80, duration: 9.8, delay: 3.5 },
            { left: 85, top: 25, duration: 8.2, delay: 4 },
            { left: 95, top: 45, duration: 11.2, delay: 4.5 },
            { left: 10, top: 65, duration: 9.2, delay: 0.3 },
            { left: 20, top: 85, duration: 10.8, delay: 0.8 },
            { left: 30, top: 15, duration: 8.8, delay: 1.3 },
            { left: 40, top: 35, duration: 9.8, delay: 1.8 },
            { left: 50, top: 55, duration: 10.2, delay: 2.3 },
            { left: 60, top: 75, duration: 8.7, delay: 2.8 },
            { left: 70, top: 95, duration: 11.5, delay: 3.3 },
            { left: 80, top: 5, duration: 9.3, delay: 3.8 },
            { left: 90, top: 15, duration: 8.9, delay: 4.3 },
            { left: 0, top: 90, duration: 10.1, delay: 4.8 },
          ].map((particle, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 bg-white/30 rounded-full"
              style={{
                left: `${particle.left}%`,
                top: `${particle.top}%`,
              }}
              animate={{
                y: [-100, 1200],
                opacity: [0, 1, 0],
                scale: [0, 1, 0],
              }}
              transition={{
                duration: particle.duration,
                repeat: Infinity,
                ease: "linear",
                delay: particle.delay,
              }}
            />
          ))}
          </div>
        )}

      </HeroBackground>
  );
}
