"use client";

import { motion } from "framer-motion";

export function FullScreenLoading({ title, subtitle = "Loading..." }: { title: string; subtitle?: string }) {
  return (
    <div className="fixed left-0 top-0 w-screen h-[100svh] z-[9999] grid place-items-center bg-black overscroll-none">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 1.05, opacity: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="text-center"
      >
        <div className="text-2xl font-semibold tracking-wide text-white">{title}</div>
        <div className="mt-2 text-sm text-zinc-300">{subtitle}</div>
      </motion.div>
    </div>
  );
}


