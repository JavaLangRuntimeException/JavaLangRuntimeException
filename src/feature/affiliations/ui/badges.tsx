"use client";

import {useState} from "react";
import {motion} from "framer-motion";
import {affiliations} from "../model";

export function AffiliationBadges() {
    const [openIndex, setOpenIndex] = useState<number | null>(null);

    const categoryOrder = [
        "university_research",
        "community",
        "engineer",
        "photographer",
        "community_director",
        "event_management",
        "community_organizer",
        "conference_staff",
        "technical_mentor",
    ] as const;

    const categoryLabels: Record<string, string> = {
        "university_research": "University & Research",
        "community": "Community",
        "engineer": "Engineer",
        "photographer": "Photographer",
        "community_director": "Community Director",
        "event_management": "Event Management",
        "community_organizer": "Community Organizer",
        "conference_staff": "Conference Staff",
        "technical_mentor": "Technical Mentor",
    };

    return (
        <section className="mt-8">
            <h2 className="text-lg font-semibold">🏢 Affiliation</h2>
            {categoryOrder.map((cat) => {
                const items = affiliations.filter((a) => a.category === cat);
                if (items.length === 0) return null;
                return (
                    <div key={cat} className="mt-4">
                        <h3 className="text-sm font-medium text-zinc-300">{categoryLabels[cat]}</h3>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {items.map((a) => {
                                const globalIndex = affiliations.indexOf(a);
                                return (
                                    <button
                                        key={a.label}
                                        onClick={() => setOpenIndex(globalIndex)}
                                        className={"inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-white/20 hover:ring-white/40 transition text-white cursor-pointer " + a.color}
                                    >
                                        {a.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                );
            })}

            {openIndex !== null && (
                <motion.div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
                    onClick={() => setOpenIndex(null)}
                    initial={{opacity: 0}}
                    animate={{opacity: 1}}
                    exit={{opacity: 0}}
                >
                    <div className="relative mx-4 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
                        <div
                            className="pointer-events-none absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-white/25 via-white/10 to-white/25 opacity-70"/>
                        <motion.div
                            className="relative rounded-2xl bg-zinc-900/80 p-5 ring-1 ring-white/10 backdrop-blur-xl shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_18px_60px_-12px_rgba(0,0,0,0.7)]"
                            initial={{y: 20, scale: 0.98, opacity: 0}}
                            animate={{y: 0, scale: 1, opacity: 1}}
                            transition={{duration: 0.18, ease: [0.22, 1, 0.36, 1]}}
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h3 className="text-base font-semibold">{affiliations[openIndex].label}</h3>
                                    <p className="mt-1 text-xs text-zinc-400">{categoryLabels[affiliations[openIndex].category]}</p>
                                </div>
                                <button
                                    aria-label="Close"
                                    onClick={() => setOpenIndex(null)}
                                    className="rounded-md px-2 py-1 text-sm text-zinc-300 hover:bg-white/10"
                                >
                                    ✕
                                </button>
                            </div>
                            <div
                                className={"mt-3 h-[3px] w-full rounded-full opacity-95 shadow-[0_0_24px_rgba(255,255,255,0.12)] " + affiliations[openIndex].color}/>
                            {affiliations[openIndex].description && (
                                <p className="mt-4 text-sm leading-6 text-zinc-200">{affiliations[openIndex].description}</p>
                            )}
                            {affiliations[openIndex].href && (
                                <div className="mt-6">
                                    <a
                                        href={affiliations[openIndex].href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20 transition-all duration-200 ring-1 ring-white/20 hover:ring-white/40"
                                    >
                                        <span>公式サイトを見る</span>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none"
                                             viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                                        </svg>
                                    </a>
                                </div>
                            )}
                        </motion.div>
                    </div>
                </motion.div>
            )}
        </section>
    );
}

