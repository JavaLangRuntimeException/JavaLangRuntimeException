"use client";

import React from "react";
import { motion } from "framer-motion";

interface PaginationProps {
    currentPage: number;
    totalPages: number;
    onPrev: () => void;
    onNext: () => void;
    isNextDisabled?: boolean;
    hidden?: boolean;
}

export function Pagination({ currentPage, totalPages, onPrev, onNext, isNextDisabled = false, hidden = false }: PaginationProps) {
    if (hidden) return null;
    return (
        <motion.div
            key="top-pagination"
            className="mb-6 flex items-center justify-center gap-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
        >
            <button
                onClick={onPrev}
                disabled={currentPage === 1}
                className="px-4 py-2 rounded-lg bg-white/5 text-white border border-white/10 backdrop-blur transition-all duration-200 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                前へ
            </button>
            <span className="text-zinc-300">{currentPage} / {totalPages}</span>
            <button
                onClick={onNext}
                disabled={isNextDisabled}
                className="px-4 py-2 rounded-lg bg-green-500/20 text-green-300 border border-green-500/30 backdrop-blur transition-all duration-200 hover:bg-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                次へ
            </button>
        </motion.div>
    );
}



