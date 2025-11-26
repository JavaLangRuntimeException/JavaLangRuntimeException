"use client";

interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
}

export function PageTransition({ children, className = "" }: PageTransitionProps) {
  return <div className={className}>{children}</div>;
}

export function LoadingOverlay() {
  return null;
}

export function MotionPageTransition({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
