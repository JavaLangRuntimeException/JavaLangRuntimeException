"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import type { LinkCard } from "../model";

export function LinkCardsGrid({ cards }: { cards: LinkCard[] }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((item, idx) => (
        <motion.a
          key={idx}
          href={item.href}
          target={item.href.startsWith("/") ? "_self" : "_blank"}
          rel="noreferrer"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 + (idx % 6) * 0.05, duration: 0.5 }}
          className="group block w-full no-underline"
        >
          <div className="relative h-80 w-full overflow-hidden rounded-xl border border-white/15 bg-white/5 backdrop-blur-sm shadow-[0_8px_30px_rgba(0,0,0,0.12)] [perspective:1200px]">
            <div className="absolute inset-0 rounded-xl transform-gpu will-change-transform transition-transform duration-700 [transform-style:preserve-3d] group-hover:[transform:rotateY(180deg)]">
              {/* front */}
              <div className="absolute inset-0 rounded-xl overflow-hidden [backface-visibility:hidden]">
                <Image src={item.imgSrc} alt={item.title} width={600} height={320} className="h-44 w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                <div className="p-4">
                  <h3 className="text-lg font-semibold tracking-tight">{item.title}</h3>
                  <p className="mt-1 text-sm text-zinc-200/90">{item.description}</p>
                </div>
              </div>
              {/* back */}
              <div className="absolute inset-0 rounded-xl bg-zinc-900/90 text-white flex items-center justify-center p-6 text-center [transform:rotateY(180deg)] [backface-visibility:hidden]">
                <p className="text-sm whitespace-pre-line text-zinc-100/90">{item.backText}</p>
              </div>
            </div>
          </div>
        </motion.a>
      ))}
    </div>
  );
}


