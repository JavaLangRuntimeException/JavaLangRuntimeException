"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { skills } from "../../skills/model";

export function SkillBadges() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">Skill Set</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {skills.map((s, idx) => (
          <button
            key={s.title}
            onClick={() => setOpenIndex(idx)}
            className={
              "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-white/20 hover:ring-white/40 transition text-white " +
              s.color
            }
          >
            <span className="truncate max-w-[240px]">{s.title}</span>
          </button>
        ))}
      </div>

      {openIndex !== null && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setOpenIndex(null)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="relative mx-4 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="pointer-events-none absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-white/25 via-white/10 to-white/25 opacity-70" />
            <motion.div
              className="relative rounded-2xl bg-zinc-900/80 p-5 ring-1 ring-white/10 backdrop-blur-xl shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_18px_60px_-12px_rgba(0,0,0,0.7)]"
              initial={{ y: 20, scale: 0.98, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold">{skills[openIndex].title}</h3>
                  <p className="mt-1 text-sm text-zinc-300">{skills[openIndex].short}</p>
                </div>
                <button
                  aria-label="Close"
                  onClick={() => setOpenIndex(null)}
                  className="rounded-md px-2 py-1 text-sm text-zinc-300 hover:bg-white/10"
                >
                  ✕
                </button>
              </div>
              <div className={"mt-3 h-[3px] w-full rounded-full opacity-95 shadow-[0_0_24px_rgba(255,255,255,0.12)] " + skills[openIndex].color} />
              <p className="mt-4 text-sm leading-6 text-zinc-200">{skills[openIndex].description}</p>
              {skills[openIndex].tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {skills[openIndex].tags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center rounded-full bg-white/5 px-2.5 py-0.5 text-[11px] font-medium text-zinc-200 ring-1 ring-white/10 hover:bg-white/10 transition"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        </motion.div>
      )}
    </section>
  );
}
