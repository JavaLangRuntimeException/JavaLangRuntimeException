"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FullScreenLoading } from "../../components/FullScreenLoading";

type IntroConfig = {
  enabled?: boolean;
  title?: string;
  subtitle?: string;
  onlyFirstVisit?: boolean;
  introDurationMs?: number;
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
  const [mounted, setMounted] = React.useState(false);
  const [showIntro, setShowIntro] = React.useState<boolean>(false);

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
    setMounted(true);
    if (!intro?.enabled) return;
    let shouldShow = !!intro.enabled;
    if (intro.onlyFirstVisit) {
      try {
        const flag = sessionStorage.getItem("intro_shown");
        shouldShow = flag === "1" ? false : true;
      } catch {}
    }
    if (shouldShow) {
      setShowIntro(true);
      const ms = intro.introDurationMs ?? 1200;
      const timer = setTimeout(() => {
        setShowIntro(false);
        if (intro.onlyFirstVisit) sessionStorage.setItem("intro_shown", "1");
      }, ms);
      return () => clearTimeout(timer);
    }
  }, [intro]);

  return (
    <div className={`relative min-h-screen overflow-hidden text-white ${className}`}>
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

      <AnimatePresence>
        {mounted && showIntro && intro?.enabled && (
          <FullScreenLoading title={intro.title || ""} subtitle={intro.subtitle || "Loading..."} />
        )}
      </AnimatePresence>

      {enableParallaxOverlay && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ transform: `translateY(${scrollY * 0.2}px)`, background: overlayGradient }}
        />
      )}

      <div className="relative z-10 mx-auto max-w-5xl px-4 py-16">{children}</div>
    </div>
  );
}


