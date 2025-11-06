"use client";

import React from "react";
import { motion } from "framer-motion";

interface FloatingParticlesProps {
    enabled?: boolean;
}

export function FloatingParticles({ enabled = true }: FloatingParticlesProps) {
    if (!enabled) return null;

    const particles = [
        {left: 5, top: 10, duration: 8, delay: 0},
        {left: 15, top: 30, duration: 9, delay: 0.5},
        {left: 25, top: 50, duration: 10, delay: 1},
        {left: 35, top: 70, duration: 11, delay: 1.5},
        {left: 45, top: 20, duration: 9.5, delay: 2},
        {left: 55, top: 40, duration: 8.5, delay: 2.5},
        {left: 65, top: 60, duration: 10.5, delay: 3},
        {left: 75, top: 80, duration: 9.8, delay: 3.5},
        {left: 85, top: 25, duration: 8.2, delay: 4},
        {left: 95, top: 45, duration: 11.2, delay: 4.5},
        {left: 10, top: 65, duration: 9.2, delay: 0.3},
        {left: 20, top: 85, duration: 10.8, delay: 0.8},
        {left: 30, top: 15, duration: 8.8, delay: 1.3},
        {left: 40, top: 35, duration: 9.8, delay: 1.8},
        {left: 50, top: 55, duration: 10.2, delay: 2.3},
        {left: 60, top: 75, duration: 8.7, delay: 2.8},
        {left: 70, top: 95, duration: 11.5, delay: 3.3},
        {left: 80, top: 5, duration: 9.3, delay: 3.8},
        {left: 90, top: 15, duration: 8.9, delay: 4.3},
        {left: 0, top: 90, duration: 10.1, delay: 4.8},
    ];

    return (
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
            {particles.map((particle, i) => (
                <motion.div
                    key={i}
                    className="absolute w-1 h-1 bg-white/30 rounded-full"
                    style={{ left: `${particle.left}%`, top: `${particle.top}%` }}
                    animate={{ y: [-100, 1200], opacity: [0, 1, 0], scale: [0, 1, 0] }}
                    transition={{ duration: particle.duration, repeat: Infinity, ease: "linear", delay: particle.delay }}
                />
            ))}
        </div>
    );
}



