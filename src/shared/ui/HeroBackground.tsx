"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ImmersiveIntro } from "../../components/ImmersiveIntro";
import { TerminalBackground } from "./TerminalBackground";

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
}: {
  images: string[];
  children: React.ReactNode;
  className?: string;
  intro?: IntroConfig;
  enableParallaxOverlay?: boolean;
  overlayGradient?: string;
}) {
  const [scrollY, setScrollY] = React.useState(0);
  // 初期状態はfalseにして、useLayoutEffectで同期的に更新（チラつきを防ぐ）
  const [showIntro, setShowIntro] = React.useState<boolean>(false);
  const [introCompleted, setIntroCompleted] = React.useState<boolean>(true);

  // 画像を事前にpreloadしてキャッシュする
  React.useEffect(() => {
    if (images.length === 0) return;

    const imageElements: HTMLImageElement[] = [];

    // すべての画像を事前に読み込む
    images.forEach((src) => {
      const img = new Image();
      img.src = src;
      imageElements.push(img);
    });

    return () => {
      // クリーンアップ
      imageElements.forEach((img) => {
        img.onload = null;
        img.onerror = null;
      });
    };
  }, [images]);

  React.useEffect(() => {
    function handleScroll() {
      setScrollY(window.scrollY || window.pageYOffset);
    }
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // useLayoutEffectで同期的に状態を設定（レンダリング前に確定させてチラつきを防ぐ）
  React.useLayoutEffect(() => {
    if (typeof window === 'undefined') return;

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
      shouldShow = !isInternalNavigation && !introShown;
    }

    setShowIntro(shouldShow);
    setIntroCompleted(!shouldShow);
  }, [intro?.enabled, intro?.onlyFirstVisit]);

  return (
    <div className={`relative min-h-screen overflow-hidden text-white ${className}`}>
      {/* 黒背景 */}
      <div className="absolute inset-0 -z-10 bg-black" />

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

          {/* CLIターミナル背景演出 */}
          <TerminalBackground />

          <div className="relative z-10 mx-auto max-w-5xl px-4 py-16">{children}</div>
        </>
      )}
    </div>
  );
}
