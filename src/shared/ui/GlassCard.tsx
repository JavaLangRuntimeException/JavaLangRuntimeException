"use client";

import React from "react";
import { motion } from "framer-motion";
import { Info } from "lucide-react";

interface GlassCardProps {
  children: React.ReactNode;
  gradientFrom: string;
  gradientTo: string;
  iconColor: string;
  className?: string;
  animationDelay?: number;
}

export function GlassCard({
  children,
  gradientFrom,
  gradientTo,
  iconColor,
  className = "",
  animationDelay = 0
}: GlassCardProps) {
  return (
    <motion.div
      className={`mb-6 ${className}`}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: animationDelay, duration: 0.7 }}
    >
      <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-white/10 px-6 py-4 backdrop-blur animate-in fade-in-50">
        <div className={`absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b ${gradientFrom} ${gradientTo}`} />
        <div className="ml-4 space-y-2">
          <div className="flex items-center gap-3">
            <Info className={`mt-0.5 h-5 w-5 ${iconColor}`} aria-hidden="true" />
            <div className="flex-1">
              {children}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

interface GlassCardSimpleProps {
  children: React.ReactNode;
  gradientFrom: string;
  gradientTo: string;
  iconColor: string;
  className?: string;
  animationDelay?: number;
}

export function GlassCardSimple({
  children,
  gradientFrom,
  gradientTo,
  iconColor,
  className = "",
  animationDelay = 0
}: GlassCardSimpleProps) {
  return (
    <motion.div
      className={`mb-6 ${className}`}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: animationDelay, duration: 0.7 }}
    >
      <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur animate-in fade-in-50">
        <div className={`absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b ${gradientFrom} ${gradientTo}`} />
        <div className="ml-3 flex items-center gap-3">
          <Info className={`mt-0.5 h-5 w-5 ${iconColor}`} aria-hidden="true" />
          <div className="flex-1">
            {children}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
