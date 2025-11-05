"use client";

import React from "react";
import {motion} from "framer-motion";
import {LinkCardsGrid} from "../../feature/links/ui/cards";
import {linkCards} from "../../feature/links/model";
import {HeroBackground} from "../../shared/ui/HeroBackground";

export default function LinksPage() {
    const bgImages = ["/image.png", "/image2.png", "/image3.png"];
    return (
        <HeroBackground images={bgImages} intro={{enabled: false}}>
            <motion.h1
                className="mb-6 text-center text-3xl font-bold sm:text-4xl md:text-5xl"
                initial={{opacity: 0, y: 30}}
                animate={{opacity: 1, y: 0}}
                transition={{delay: 0.2, duration: 0.7}}
            >
                リンク集
            </motion.h1>

            <LinkCardsGrid cards={linkCards}/>

            <motion.div
                className="mt-12 text-center"
                initial={{opacity: 0, y: 20}}
                animate={{opacity: 1, y: 0}}
                transition={{delay: 0.6, duration: 0.7}}
            >
                <p className="text-sm text-zinc-300/80 leading-relaxed">
                    ※ 所属組織の公式サイトへのリンクは、トップページの「🏢 Affiliation」セクションにある各タグをクリックすると表示されます。
                </p>
            </motion.div>
        </HeroBackground>
    );
}
