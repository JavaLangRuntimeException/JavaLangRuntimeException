"use client";

import React from "react";
import { motion } from "framer-motion";
import { ProfileHeader } from "../feature/profile/ui/profile-header";
import { AffiliationBadges } from "../feature/affiliations/ui/badges";
import { HeroBackground } from "../shared/ui/HeroBackground";


export default function PortfolioLinks() {
  const bgImages = ["/image.png", "/image2.png", "/image3.png"];
  return (
      <HeroBackground
        images={bgImages}
        intro={{ enabled: true, title: "taramanji", subtitle: "Welcome", onlyFirstVisit: true, introDurationMs: 1200 }}
      >
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
            <p className="mt-1 text-sm text-zinc-200/90">プロフィール・SNS・連絡先のリンク一覧。お問い合わせはこちらから。</p>
          </a>
          <a href="/reserve" className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur hover:bg-white/10 transition">
            <h3 className="text-base font-semibold">Ask Me</h3>
            <p className="mt-1 text-sm text-zinc-200/90">ご相談・面談予約ページ。ご希望の日時を選択してください。</p>
          </a>
        </div>
      </HeroBackground>
  );
}
