"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LinkCardsGrid } from "../../feature/links/ui/cards";
import { linkCards } from "../../feature/links/model";

export default function LinksPage() {
  const [scrollY, setScrollY] = useState(0);
  const bgImages = ["/image.png", "/image2.png", "/image3.png"];
  const [bgIndex, setBgIndex] = useState(0);

  useEffect(() => {
    function handleScroll() {
      setScrollY(window.scrollY || window.pageYOffset);
    }
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setBgIndex((idx) => (idx + 1) % bgImages.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [bgImages.length]);

  return (
    <div className="relative min-h-screen overflow-hidden text-white">
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
      {/* Links/Contact: 初回オーバーレイは無し */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          transform: `translateY(${scrollY * 0.2}px)`,
          background: "linear-gradient(to bottom, rgba(0,0,0,0.55), rgba(0,0,0,0.75))",
        }}
      />

      <div className="relative z-10 mx-auto max-w-5xl px-4 py-16">
        <motion.h1
          className="mb-6 text-center text-3xl font-bold sm:text-4xl md:text-5xl"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.7 }}
        >
          リンク集
        </motion.h1>

        <LinkCardsGrid cards={linkCards} />
      </div>
    </div>
  );
}


