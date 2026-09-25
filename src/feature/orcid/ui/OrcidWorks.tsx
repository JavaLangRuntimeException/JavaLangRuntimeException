"use client";

import React, {useEffect, useState} from "react";
import {motion} from "framer-motion";
import {ORCID_SELF_NAME, ORCID_WORK_TYPE_LABELS, type OrcidWork} from "../model";

export const OrcidWorks: React.FC<{ showAnimations?: boolean; delay?: number }> = ({
                                                                                       showAnimations = true,
                                                                                       delay = 0
                                                                                   }) => {
    const [works, setWorks] = useState<OrcidWork[]>([]);
    const [orcidId, setOrcidId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/orcid");
                const data: { orcidId?: string; works?: OrcidWork[] } = await res.json();
                if (!cancelled) {
                    setWorks(data.works || []);
                    setOrcidId(data.orcidId || null);
                }
            } catch (error) {
                console.error('[OrcidWorks] Error fetching ORCID works:', error);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    return (
        <motion.div
            className="mt-16"
            initial={showAnimations ? {opacity: 0, y: 30} : {opacity: 1, y: 0}}
            animate={{opacity: 1, y: 0}}
            transition={showAnimations ? {delay, duration: 0.6} : {duration: 0}}
        >
            <h2 className="text-lg font-semibold">🎓 Publications</h2>
            {loading && (
                <div className="mt-4 flex items-center justify-center gap-3">
                    <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-lime-400"></div>
                    <p className="text-sm text-zinc-400">論文を取得中...</p>
                </div>
            )}

            {!loading && works.length === 0 && (
                <p className="mt-2 text-sm text-zinc-400">論文がまだありません</p>
            )}

            {!loading && works.length > 0 && (
                <div className="grid gap-6 sm:grid-cols-1 mt-3">
                    {works.map((work, index) => (
                        <WorkCard
                            key={work.putCode}
                            work={work}
                            index={index}
                            showAnimations={showAnimations}
                            delay={delay + 0.3}
                        />
                    ))}
                </div>
            )}

            {!loading && orcidId && (
                <p className="mt-4 text-right text-xs text-zinc-400">
                    Source:{" "}
                    <a
                        href={`https://orcid.org/${orcidId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-lime-300"
                    >
                        ORCID {orcidId}
                    </a>
                </p>
            )}
        </motion.div>
    );
};

// 論文カードコンポーネント
const WorkCard: React.FC<{
    work: OrcidWork;
    index: number;
    showAnimations: boolean;
    delay: number;
}> = ({work, index, showAnimations, delay}) => {
    const Wrapper = work.url ? motion.a : motion.div;
    return (
        <Wrapper
            {...(work.url ? {href: work.url, target: "_blank", rel: "noopener noreferrer"} : {})}
            className="group relative rounded-xl border border-white/10 overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-lime-500/20"
            initial={showAnimations ? {opacity: 0, y: 20} : {opacity: 1, y: 0}}
            animate={{opacity: 1, y: 0}}
            transition={showAnimations ? {delay: delay + index * 0.1, duration: 0.5} : {duration: 0}}
            whileHover={{scale: 1.02}}
            whileTap={{scale: 0.98}}
        >
            <div className="absolute inset-0 bg-gradient-to-br from-black/40 via-black/50 to-black/60 backdrop-blur-sm"/>

            <div className="relative p-6">
                <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
                    <span className="px-2 py-1 rounded-full bg-lime-500/20 text-lime-300 border border-lime-500/30">
                        {ORCID_WORK_TYPE_LABELS[work.type] ?? work.type}
                    </span>
                    {work.date && <span className="text-white/70">{work.date}</span>}
                </div>

                <h3 className="text-lg font-semibold text-white group-hover:text-lime-300 transition-colors drop-shadow-lg">
                    {work.title}
                </h3>

                {work.authors.length > 0 && (
                    <p className="mt-2 text-sm text-white/80 drop-shadow">
                        {work.authors.map((author, i) => (
                            <React.Fragment key={i}>
                                {i > 0 && ", "}
                                <span className={author === ORCID_SELF_NAME ? "font-semibold text-white underline" : undefined}>
                                    {author}
                                </span>
                            </React.Fragment>
                        ))}
                    </p>
                )}

                {work.venue && (
                    <p className="mt-2 text-sm italic text-white/70 drop-shadow">{work.venue}</p>
                )}

                {work.doi && (
                    <div className="mt-4 flex items-center text-lime-400 group-hover:text-lime-300 transition-colors drop-shadow-lg">
                        <span className="text-sm font-semibold">DOI: {work.doi}</span>
                        <motion.span
                            className="ml-2"
                            animate={{x: [0, 5, 0]}}
                            transition={{duration: 1.5, repeat: Infinity}}
                        >
                            →
                        </motion.span>
                    </div>
                )}
            </div>
        </Wrapper>
    );
};
