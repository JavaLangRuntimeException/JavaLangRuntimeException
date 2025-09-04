"use client";

import { motion } from "framer-motion";

export default function Loading() {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 1.05, opacity: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="text-center"
      >
        <div className="text-2xl font-semibold tracking-wide text-white">Links/Contact</div>
        <div className="mt-2 text-sm text-zinc-300">Loading...</div>
      </motion.div>
    </div>
  );
}


