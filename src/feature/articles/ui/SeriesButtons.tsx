"use client";

import React from "react";
import { motion } from "framer-motion";

interface SeriesButtonsProps {
    seriesList: string[];
    selectedSeries: string;
    onSelect: (series: string) => void;
    onClear: () => void;
}

export function SeriesButtons({ seriesList, selectedSeries, onSelect, onClear }: SeriesButtonsProps) {
    return (
        <motion.div
            key="series-buttons"
            className="mb-6 flex flex-wrap gap-2 justify-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
        >
            {seriesList.map((series) => (
                <button
                    key={series}
                    onClick={() => onSelect(series)}
                    className={
                        series === selectedSeries
                            ? "px-4 py-2 rounded-lg bg-green-500/20 text-green-300 border border-green-500/30 backdrop-blur transition-all duration-200 hover:bg-green-500/30"
                            : "px-4 py-2 rounded-lg bg-white/5 text-white/90 border border-white/10 backdrop-blur transition-all duration-200 hover:bg-white/10 hover:border-white/20"
                    }
                >
                    {series}
                </button>
            ))}
            {selectedSeries && (
                <button
                    onClick={onClear}
                    className="px-4 py-2 rounded-lg bg-red-500/20 text-red-300 border border-red-500/30 backdrop-blur transition-all duration-200 hover:bg-red-500/30"
                >
                    Clear
                </button>
            )}
        </motion.div>
    );
}



