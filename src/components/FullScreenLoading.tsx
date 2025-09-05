"use client";

import { motion } from "framer-motion";

export function FullScreenLoading({ title, subtitle = "Loading..." }: { title?: string; subtitle?: string }) {
  const letters = Array.from(title || "");
  return (
    <div className="fixed inset-0 z-[9999] grid place-items-center bg-black overscroll-none">
      {/* Ambient gradients */}
      <div className="pointer-events-none absolute -top-1/3 -left-1/3 h-[80vh] w-[80vh] rounded-full blur-3xl opacity-60" style={{ background: "radial-gradient(circle at center, rgba(59,130,246,0.35), transparent 60%)" }} />
      <div className="pointer-events-none absolute -bottom-1/3 -right-1/3 h-[80vh] w-[80vh] rounded-full blur-3xl opacity-60" style={{ background: "radial-gradient(circle at center, rgba(16,185,129,0.35), transparent 60%)" }} />

      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 1.04, opacity: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative text-center"
        role="status"
        aria-live="polite"
      >
        {/* Rotating rings */}
        <div className="relative mx-auto mb-6 h-20 w-20 sm:h-24 sm:w-24">
          <div className="absolute inset-0 rounded-full border-2 border-white/10" />
          <div className="absolute inset-0 rounded-full border-t-2 border-r-2 border-white/70 animate-spin" style={{ animationDuration: "1.2s" }} />
          <div className="absolute inset-2 rounded-full border-t-2 border-l-2 border-white/40 animate-spin" style={{ animationDuration: "2s" }} />
        </div>

        {/* Title (per-letter motion) */}
        <div className="text-2xl sm:text-3xl font-semibold tracking-wide bg-gradient-to-r from-white via-zinc-200 to-white bg-clip-text text-transparent">
          {letters.map((ch, i) => (
            <motion.span
              key={`${ch}-${i}`}
              initial={{ y: 6, opacity: 0 }}
              animate={{ y: [0, -2, 0], opacity: 1 }}
              transition={{ duration: 1.6, delay: i * 0.04, repeat: Infinity, ease: "easeInOut" }}
              className="inline-block"
            >
              {ch === " " ? "\u00A0" : ch}
            </motion.span>
          ))}
        </div>

        {/* Subtitle (animated dots) */}
        <div className="mt-2 text-sm sm:text-base text-zinc-300/90 flex items-center justify-center gap-1">
          <span>{subtitle.replace(/\.*$/, "")}</span>
          <motion.span
            initial={{ opacity: 0.2 }}
            animate={{ opacity: [0.2, 1, 0.2] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          >
            .
          </motion.span>
          <motion.span
            initial={{ opacity: 0.2 }}
            animate={{ opacity: [0.2, 1, 0.2] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: 0.2 }}
          >
            .
          </motion.span>
          <motion.span
            initial={{ opacity: 0.2 }}
            animate={{ opacity: [0.2, 1, 0.2] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: 0.4 }}
          >
            .
          </motion.span>
        </div>

        {/* Subtle glass card glow */}
        <div className="pointer-events-none absolute -inset-x-8 -bottom-8 h-12 blur-2xl bg-white/10" />
      </motion.div>
    </div>
  );
}


