"use client";

import React from "react";

interface NasaTlxSliderProps {
  value: number | null;
  onChange: (value: number) => void;
  label: string;
  questionNumber: string;
  disabled?: boolean;
}

export function NasaTlxSlider({ value, onChange, label, questionNumber, disabled }: NasaTlxSliderProps) {
  const [selectedPosition, setSelectedPosition] = React.useState<number | null>(value);

  React.useEffect(() => {
    setSelectedPosition(value);
  }, [value]);

  const handleClick = (position: number) => {
    if (disabled) return;
    setSelectedPosition(position);
    onChange(position);
  };

  return (
    <div className="rounded-2xl border border-white/20 bg-white/90 p-6 shadow-lg backdrop-blur">
      <h3 className="mb-4 text-sm font-semibold text-zinc-700">
        {questionNumber} {label}
      </h3>
      <div className="mb-2 flex justify-between text-xs text-zinc-600">
        <span>低い(Low)</span>
        <span>高い(High)</span>
      </div>
      <div className="relative flex h-32 items-center px-2">
        <div className="flex w-full items-center justify-between">
          {/* 21本の縦線 */}
          {Array.from({ length: 21 }, (_, i) => (
            <div key={`line-${i}`} className="relative flex flex-col items-center">
              <div className={`h-20 bg-zinc-300 ${i === 0 || i === 10 || i === 20 ? "w-1" : "w-0.5"}`} />
            </div>
          ))}
        </div>
        {/* 20個のクリック可能な領域（線と線の間） */}
        <div className="absolute inset-0 flex items-center">
          {Array.from({ length: 20 }, (_, i) => i + 1).map((position) => (
            <button
              key={`space-${position}`}
              type="button"
              onClick={() => handleClick(position)}
              disabled={disabled}
              className={`relative flex h-full flex-1 items-center justify-center transition-all ${
                disabled ? "cursor-not-allowed" : "cursor-pointer hover:bg-blue-50/50"
              }`}
              aria-label={`選択肢 ${position}`}
            >
              {selectedPosition === position && (
                <div className="absolute flex flex-col items-center">
                  <div className="h-24 w-1 bg-blue-500 rounded-full shadow-lg" />
                  <div className="mt-1 rounded-full bg-blue-500 px-2 py-0.5 text-xs font-semibold text-white shadow">
                    {position}
                  </div>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
      {selectedPosition === null && (
        <p className="mt-2 text-xs text-red-600">回答は必須です</p>
      )}
    </div>
  );
}
