"use client";

import React from "react";
import { motion } from "framer-motion";
import { CheckCircle } from "lucide-react";

export default function ReserveResearchPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:p-6">
      <main className="max-w-4xl mx-auto">
        <motion.div
          className="mt-20 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <motion.div
            className="mb-6 flex justify-center"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          >
            <div className="rounded-full bg-green-100 p-4">
              <CheckCircle className="h-16 w-16 text-green-600" />
            </div>
          </motion.div>

          <motion.h1
            className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-slate-900 via-slate-700 to-slate-600 bg-clip-text text-transparent mb-6"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            実験参加人数の定員に達しました！
          </motion.h1>

          <motion.p
            className="text-lg sm:text-xl text-slate-700 mb-8"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            ご協力ありがとうございました！
          </motion.p>

          <motion.div
            className="rounded-2xl border border-white/20 bg-white/90 p-8 shadow-lg backdrop-blur"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <p className="text-base text-slate-600 leading-relaxed">
              多くの方々にご協力いただき、実験参加人数の定員に達しました。
              <br />
              ご応募いただいた皆様、ありがとうございました。
            </p>
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
}
