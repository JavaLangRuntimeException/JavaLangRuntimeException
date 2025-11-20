"use client";

import React, { useEffect, useState } from 'react';

interface CircleCheckLoaderProps {
  /** ローディングが完了したかどうか */
  isComplete?: boolean;
  /** サイズ */
  size?: number;
  /** 完了後のコールバック */
  onComplete?: () => void;
}

export function CircleCheckLoader({
  isComplete = false,
  size = 64,
  onComplete
}: CircleCheckLoaderProps) {
  const [showCheck, setShowCheck] = useState(false);
  const [hideDotsForCheck, setHideDotsForCheck] = useState(false);
  const dotCount = 5;
  const radius = size * 0.4;
  const dotSize = 12;

  useEffect(() => {
    if (isComplete) {
      // 円を描き終わったらチェックマークを表示
      const checkTimer = setTimeout(() => {
        setShowCheck(true);
        // チェックマークが描かれ始めたらドットを非表示
        setHideDotsForCheck(true);
        if (onComplete) {
          setTimeout(onComplete, 800);
        }
      }, 800); // 円形成アニメーション後
      return () => clearTimeout(checkTimer);
    } else {
      setShowCheck(false);
      setHideDotsForCheck(false);
    }
  }, [isComplete, onComplete]);

  if (!isComplete) {
    // ローディング中: ずっと波打つ5つのドット
    return (
      <div className="flex gap-2 items-center justify-center">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-3 w-3 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600"
            style={{
              animationName: 'wave',
              animationDuration: '1.2s',
              animationTimingFunction: 'ease-in-out',
              animationIterationCount: 'infinite',
              animationDelay: `${i * 0.1}s`,
            }}
          />
        ))}
      </div>
    );
  }

  // 完了時: 横並びのドットから円を描く + チェックマーク
  const gap = 8; // ドット間の間隔

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {/* 5つのドットが横並びから円を描く */}
      {Array.from({ length: dotCount }).map((_, i) => {
        // 横並びの位置（ローディングと同じ）
        const lineX = (i - 2) * (dotSize + gap);

        // 右から左へ: インデックスを反転 (4, 3, 2, 1, 0)
        const delayIndex = dotCount - 1 - i;

        return (
          <div
            key={i}
            className="absolute rounded-full bg-gradient-to-br from-blue-500 to-indigo-600"
            style={{
              width: dotSize,
              height: dotSize,
              left: '50%',
              top: '50%',
              // 最初は横並び、アニメーションで円形に移動
              transform: `translate(calc(-50% + ${lineX}px), -50%)`,
              opacity: hideDotsForCheck ? 0 : 1,
              animation: `dot-to-circle-${i} 0.8s ease-out forwards`,
              animationDelay: `${delayIndex * 0.05}s`,
            }}
          />
        );
      })}

      {/* 各ドット用のキーフレームをインラインスタイルで定義 */}
      <style jsx>{`
        ${Array.from({ length: dotCount }).map((_, i) => {
          const angle = (i / dotCount) * Math.PI * 2 - Math.PI / 2;
          const circleX = Math.cos(angle) * radius;
          const circleY = Math.sin(angle) * radius;
          const lineX = (i - 2) * (dotSize + gap);

          return `
            @keyframes dot-to-circle-${i} {
              0% {
                transform: translate(calc(-50% + ${lineX}px), -50%);
                opacity: 1;
              }
              100% {
                transform: translate(calc(-50% + ${circleX}px), calc(-50% + ${circleY}px));
                opacity: 1;
              }
            }
          `;
        }).join('\n')}
      `}</style>

      {/* チェックマーク（SVG） */}
      {showCheck && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            animationName: 'fade-in-check',
            animationDuration: '0.3s',
            animationTimingFunction: 'ease-out',
            animationFillMode: 'forwards',
          }}
        >
          <svg
            width={size * 0.6}
            height={size * 0.6}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M5 13l4 4L19 7"
              stroke="url(#gradient)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="100"
              strokeDashoffset="100"
              style={{
                animationName: 'draw-check',
                animationDuration: '0.6s',
                animationTimingFunction: 'ease-out',
                animationFillMode: 'forwards',
              }}
            />
            <defs>
              <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#6366f1" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      )}
    </div>
  );
}

interface LoadingModalProps {
  isOpen: boolean;
  isComplete?: boolean;
  title?: string;
  message?: string;
  completeMessage?: string;
  icon?: React.ReactNode;
}

export function LoadingModal({
  isOpen,
  isComplete = false,
  title = "処理中",
  message = "処理しています…",
  completeMessage = "完了しました！",
  icon
}: LoadingModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-3 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/20 bg-white/95 shadow-2xl backdrop-blur">
        <div className="flex items-center gap-2 border-b border-white/20 bg-gradient-to-r from-blue-500/90 to-indigo-500/90 px-5 py-3 backdrop-blur">
          {icon}
          <h3 className="text-base font-semibold text-white drop-shadow">{title}</h3>
        </div>
        <div className="p-8 text-center">
          <div className="mx-auto mb-4 flex items-center justify-center">
            <CircleCheckLoader isComplete={isComplete} size={64} />
          </div>
          <div className="text-sm font-medium text-zinc-700">
            {isComplete ? completeMessage : message}
          </div>
        </div>
      </div>
    </div>
  );
}

