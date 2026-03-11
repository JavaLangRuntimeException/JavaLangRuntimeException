"use client";

import React from "react";
import { motion } from "framer-motion";

interface NavCard {
    href: string;
    title: string;
    color: "blue" | "green" | "purple" | "orange";
    description: React.ReactNode;
}

interface NavCardsProps {
    items: NavCard[];
    animate?: boolean;
    delay?: number;
}

const colorToClasses: Record<NavCard["color"], { dot: string; hover: string; title: string; shadow: string }> = {
    blue: {
        dot: "bg-blue-400",
        hover: "hover:bg-white/10",
        title: "group-hover:text-blue-300",
        shadow: "hover:shadow-blue-500/10",
    },
    green: {
        dot: "bg-green-400",
        hover: "hover:bg-white/10",
        title: "group-hover:text-green-300",
        shadow: "hover:shadow-green-500/10",
    },
    purple: {
        dot: "bg-purple-400",
        hover: "hover:bg-white/10",
        title: "group-hover:text-purple-300",
        shadow: "hover:shadow-purple-500/10",
    },
    orange: {
        dot: "bg-orange-400",
        hover: "hover:bg-white/10",
        title: "group-hover:text-orange-300",
        shadow: "hover:shadow-orange-500/10",
    },
};

export function NavCards({ items, animate = true, delay = 1.0 }: NavCardsProps) {
    return (
        <motion.div
            className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            initial={animate ? { opacity: 0, y: 30 } : { opacity: 1, y: 0 }}
            animate={{ opacity: 1, y: 0 }}
            transition={animate ? { delay, duration: 0.6 } : { duration: 0 }}
        >
            {items.map((item, idx) => {
                const color = colorToClasses[item.color];
                return (
                    <motion.a
                        key={`${item.href}-${idx}`}
                        href={item.href}
                        className={`group rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur transition-all duration-300 ${color.hover} hover:scale-105 hover:shadow-xl ${color.shadow}`}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                    >
                        <motion.div
                            className="flex items-center gap-3 mb-2"
                            whileHover={{ x: 5 }}
                            transition={{ type: "spring", stiffness: 300 }}
                        >
                            <div className={`w-2 h-2 rounded-full ${color.dot} animate-pulse`} />
                            <h3 className={`text-lg font-semibold text-white ${color.title} transition-colors`}>
                                {item.title}
                            </h3>
                        </motion.div>
                        <p className="text-sm text-zinc-200/90 group-hover:text-white/90 transition-colors">
                            {item.description}
                        </p>
                    </motion.a>
                );
            })}
        </motion.div>
    );
}



