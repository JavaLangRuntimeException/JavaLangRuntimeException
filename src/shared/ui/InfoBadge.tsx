"use client";

import React from "react";

interface InfoBadgeProps {
  children: React.ReactNode;
  dotColor: string;
  className?: string;
}

export function InfoBadge({
  children,
  dotColor,
  className = ""
}: InfoBadgeProps) {
  return (
    <p className={`inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] text-white/80 backdrop-blur ${className}`}>
      <span className={`h-2 w-2 rounded-full ${dotColor}`} />
      {children}
    </p>
  );
}
