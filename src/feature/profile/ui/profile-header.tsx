"use client";

import Image from "next/image";
import { motion } from "framer-motion";

export function ProfileHeader() {
  return (
    <section className="flex flex-col items-center text-center">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
        <div className="relative h-28 w-28 overflow-hidden rounded-full ring-2 ring-white/40 shadow-lg">
          <Image src="/image.png" alt="棚橋 柊太" fill className="object-cover" />
        </div>
      </motion.div>
      <motion.h1 className="mt-5 text-3xl font-bold" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.5 }}>
        Shuta Tanahashi
      </motion.h1>
      <motion.p className="mt-1 text-zinc-300" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.5 }}>
      Software Engineer<br />Backend Engineer<br />XR Engineer<br />Community Director
      </motion.p>
    </section>
  );
}


