"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { HeroBackground } from "../../shared/ui/HeroBackground";
import { ContactForm } from "../../feature/contact/ui/ContactForm";
import { GlassCard } from "../../shared/ui/GlassCard";
import { CircleCheckLoader } from "../../shared/ui/CircleCheckLoader";

const alternateContacts = [
  { label: "NxTEND", email: "shuta.tanahashi@nxtend.or.jp" },
  { label: "JINEN・STECH", email: "s.tanahashi@jinnen.co.jp" },
  { label: "株式会社888", email: "shuta.tanahashi@888incs.com" },
  { label: "TSKaigi", email: "tanahashi@tskaigi.org" },
  { label: "RM2CLab", email: "tanahasi@rm2c.ise.ritsumei.ac.jp" },
  { label: "その他", email: "tanahashishuta@gmail.com" },
];

export default function ContactPage() {
  const bgImages = ["/image.png", "/image2.png", "/image3.png"];
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [countdown, setCountdown] = useState(5);

  // カウントダウン処理
  useEffect(() => {
    if (isSubmitted && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (isSubmitted && countdown === 0) {
      setIsSubmitted(false);
      setCountdown(10);
    }
  }, [isSubmitted, countdown]);

  return (
    <HeroBackground images={bgImages} intro={{ enabled: false }}>
      <motion.div
        className="mx-auto max-w-4xl px-4 py-8"
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
          お問い合わせ
        </motion.h1>

        <motion.p
          className="mb-8 text-center text-lg text-white/80"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.7 }}
        >
          ご質問やご相談がございましたら、お気軽にお問い合わせください。
        </motion.p>

        {/* お問い合わせ情報のガラスデザイン */}
        <GlassCard
          gradientFrom="from-green-400"
          gradientTo="to-emerald-500"
          iconColor="text-green-300"
          animationDelay={0.5}
        >
          <p className="m-0 text-sm text-white/90">
            お問い合わせ対応時間: <span className="font-semibold text-white">9:00-21:00</span>
          </p>
        </GlassCard>

        <GlassCard
          gradientFrom="from-blue-400"
          gradientTo="to-indigo-500"
          iconColor="text-blue-300"
          animationDelay={0.6}
        >
          <p className="m-0 text-sm text-white/90">
            <span className="font-semibold text-white">お問い合わせいただいてから1週間以内にお返事いたします</span>
          </p>
        </GlassCard>

        <GlassCard
          gradientFrom="from-cyan-400"
          gradientTo="to-sky-500"
          iconColor="text-cyan-300"
          animationDelay={0.65}
        >
          <div className="space-y-3">
            <p className="m-0 text-sm text-white/90">
              <span className="font-semibold text-white">代替連絡先</span>
            </p>
            <div className="space-y-2 text-sm text-white/85">
              {alternateContacts.map((contact) => (
                <div
                  key={contact.label}
                  className="flex flex-col gap-1 rounded-lg border border-white/10 bg-white/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="font-medium text-white">{contact.label}</span>
                  <a
                    href={`mailto:${contact.email}`}
                    className="break-all text-cyan-100 underline decoration-cyan-200/70 underline-offset-4 transition hover:text-white"
                  >
                    {contact.email}
                  </a>
                </div>
              ))}
            </div>
          </div>
        </GlassCard>

        {/* ファイル添付の注意事項 */}
        <GlassCard
          gradientFrom="from-purple-400"
          gradientTo="to-pink-500"
          iconColor="text-purple-300"
          animationDelay={0.7}
        >
          <div className="space-y-2">
            <p className="m-0 text-sm text-white/90">
              <span className="font-semibold text-white">ファイル添付について</span>
            </p>
            <div className="ml-8 space-y-1 text-xs text-white/80">
              <p>• 最大5個までファイルを添付できます</p>
              <p>• 1ファイルあたり3MB以下にしてください</p>
              <p>• ファイル形式は問いません</p>
              <p>• ファイルサイズが大きい場合は、GoogleDriveやOneDriveなどのクラウドストレージにアップロードして共有リンクを本文に記載してください</p>
            </div>
          </div>
        </GlassCard>

        {isSubmitted ? (
          <motion.div
            className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-3 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div
              className="w-full max-w-md overflow-hidden rounded-2xl border border-white/20 bg-white/95 shadow-2xl backdrop-blur"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
            >
              <div className="flex items-center gap-2 border-b border-white/20 bg-gradient-to-r from-green-500/90 to-emerald-500/90 px-5 py-3 backdrop-blur">
                <div className="text-2xl">✉️</div>
                <h3 className="text-base font-semibold text-white drop-shadow">お問い合わせを受け付けました</h3>
              </div>
              <div className="p-8 text-center">
                {/* 完了アニメーション */}
                <div className="mb-6 flex items-center justify-center">
                  <CircleCheckLoader isComplete={true} size={80} />
                </div>
                <div className="space-y-4 text-zinc-700">
                  <p className="text-lg">
                    お問い合わせありがとうございます。
                  </p>
                  <p>
                    確認メールをお送りいたしました。<br />スパム(迷惑)メールも合わせてご確認ください。
                  </p>
                  <p className="text-sm text-zinc-600">
                    ※1週間以内にこちらから再度連絡いたします。
                  </p>
                  <div className="mt-6 rounded-lg bg-zinc-50 p-3">
                    <p className="text-sm text-zinc-600">
                      {countdown}秒後に自動で閉じます
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : (
          <ContactForm onSuccess={() => setIsSubmitted(true)} />
        )}
      </motion.div>
    </HeroBackground>
  );
}
