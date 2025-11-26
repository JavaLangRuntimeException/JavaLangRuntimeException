"use client";

import React from "react";
import { cn } from "../lib/cn";

type Variant = "success" | "info" | "warning" | "error";

export function AlertBanner({
  message,
  className,
  variant = "success",
}: {
  message: string;
  className?: string;
  variant?: Variant;
}) {
  const stylesByVariant: Record<Variant, string> = {
    success: "border-emerald-300/60 bg-emerald-50/90 text-emerald-800",
    info: "border-blue-300/60 bg-blue-50/90 text-blue-800",
    warning: "border-amber-300/60 bg-amber-50/90 text-amber-900",
    error: "border-red-300/60 bg-red-50/90 text-red-800",
  };

  return (
    <div className={cn(className)}>
      <div className={cn("rounded-md border px-3 py-2 text-xs shadow-sm", stylesByVariant[variant])}>
        {message}
      </div>
    </div>
  );
}


