"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ImmersiveIntro } from "../../components/ImmersiveIntro";

type IntroConfig = {
  enabled?: boolean;
  title?: string;
  subtitle?: string;
  onlyFirstVisit?: boolean;
  introDurationMs?: number;
  onComplete?: () => void;
  onProgressComplete?: () => void;
};

export function HeroBackground({
  images,
  children,
  className = "",
  intro,
  enableParallaxOverlay = true,
  overlayGradient = "linear-gradient(to bottom, rgba(0,0,0,0.55), rgba(0,0,0,0.75))",
  cycleMs = 5000,
}: {
  images: string[];
  children: React.ReactNode;
  className?: string;
  intro?: IntroConfig;
  enableParallaxOverlay?: boolean;
  overlayGradient?: string;
  cycleMs?: number;
}) {
  const [scrollY, setScrollY] = React.useState(0);
  const [bgIndex, setBgIndex] = React.useState(0);
  // intro.enabledが設定されている場合は初期値をtrueにして、チラつきを防ぐ
  const [showIntro, setShowIntro] = React.useState<boolean>(!!intro?.enabled);
  // intro.enabledがfalseの場合は最初から完了状態にする
  const [introCompleted, setIntroCompleted] = React.useState<boolean>(!intro?.enabled);

  React.useEffect(() => {
    function handleScroll() {
      setScrollY(window.scrollY || window.pageYOffset);
    }
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  React.useEffect(() => {
    const t = setInterval(() => setBgIndex((i) => (i + 1) % images.length), cycleMs);
    return () => clearInterval(t);
  }, [images.length, cycleMs]);

  React.useEffect(() => {
    if (!intro?.enabled) {
      setShowIntro(false);
      setIntroCompleted(true);
      return;
    }

    // 内部ナビゲーションかどうかをチェック
    const isInternalNavigation = sessionStorage.getItem('internal_navigation') === 'true';
    const introShown = sessionStorage.getItem("intro_shown") === "1";

    let shouldShow = !!intro.enabled;
    if (intro.onlyFirstVisit) {
      // 内部ナビゲーションの場合、またはイントロが既に表示済みの場合は表示しない
      shouldShow = !isInternalNavigation && !introShown;
    }

    if (shouldShow) {
      setShowIntro(true);
      setIntroCompleted(false);
    } else {
      setShowIntro(false);
      setIntroCompleted(true);
    }
  }, [intro]);

  return (
    <div className={`relative min-h-screen overflow-hidden text-white ${className}`}>
      {/* Welcomeイントロが完了するまでは真っ黒な背景、完了後は通常の背景画像 */}
      {!introCompleted ? (
        <div className="absolute inset-0 -z-10 bg-black" />
      ) : (
        <div className="absolute inset-0 -z-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={bgIndex}
              className="absolute inset-0"
              style={{
                backgroundImage: `url(${images[bgIndex]})`,
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
      )}

      <AnimatePresence>
        {showIntro && intro?.enabled && (
          <ImmersiveIntro
            title={intro.title || ""}
            subtitle={intro.subtitle || "Welcome to my portfolio"}
            onComplete={() => {
              setShowIntro(false);
              setIntroCompleted(true);
              if (intro.onlyFirstVisit) sessionStorage.setItem("intro_shown", "1");
              // カスタムコールバックを実行
              if (intro.onComplete) {
                intro.onComplete();
              }
            }}
            onProgressComplete={intro.onProgressComplete}
          />
        )}
      </AnimatePresence>

      {/* Welcomeイントロが完了してからエフェクトとコンテンツを表示 */}
      {introCompleted && (
        <>
          {enableParallaxOverlay && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{ transform: `translateY(${scrollY * 0.2}px)`, background: overlayGradient }}
            />
          )}

          {/* 追加のダイナミックエフェクト */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {/* スクロール連動のパーティクル */}
            {[
              { left: 10, top: 20, delay: 0, duration: 4 },
              { left: 25, top: 60, delay: 0.5, duration: 5 },
              { left: 40, top: 15, delay: 1, duration: 4.5 },
              { left: 60, top: 80, delay: 1.5, duration: 5.5 },
              { left: 80, top: 30, delay: 2, duration: 4.2 },
              { left: 15, top: 70, delay: 0.3, duration: 4.8 },
              { left: 35, top: 45, delay: 0.8, duration: 5.2 },
              { left: 55, top: 25, delay: 1.2, duration: 4.7 },
              { left: 75, top: 65, delay: 1.8, duration: 5.1 },
              { left: 90, top: 40, delay: 2.2, duration: 4.9 },
              { left: 5, top: 85, delay: 0.2, duration: 5.3 },
              { left: 30, top: 10, delay: 0.7, duration: 4.6 },
              { left: 50, top: 75, delay: 1.3, duration: 5.4 },
              { left: 70, top: 50, delay: 1.7, duration: 4.4 },
              { left: 85, top: 90, delay: 2.5, duration: 5.6 },
            ].map((particle, i) => (
              <motion.div
                key={i}
                className="absolute w-2 h-2 bg-white/20 rounded-full blur-sm"
                style={{
                  left: `${particle.left}%`,
                  top: `${particle.top}%`,
                }}
                animate={{
                  y: [0, -scrollY * 0.1],
                  opacity: [0.2, 0.6, 0.2],
                  scale: [0.5, 1.5, 0.5],
                }}
                transition={{
                  duration: particle.duration,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: particle.delay,
                }}
              />
            ))}

            {/* グリッドパターン */}
            <div
              className="absolute inset-0 opacity-5"
              style={{
                backgroundImage: `
                  linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
                `,
                backgroundSize: '50px 50px',
                transform: `translate(${scrollY * 0.05}px, ${scrollY * 0.05}px)`
              }}
            />
          </div>

          <div className="relative z-10 mx-auto max-w-5xl px-4 py-16">{children}</div>
        </>
      )}
    </div>
  );
}


