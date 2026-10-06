import { useEffect, useState } from "react";
import { BACKGROUND_COMMANDS } from "./commands";
import { TerminalLines } from "./TerminalLines";
import { useTerminalStream } from "./use-terminal-stream";

const COLUMN_COUNT = 3;
const TIMING = { typing: 10, afterCommand: 60, outputLine: 40, pause: 200 };

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function Column({ index, enabled }: { index: number; enabled: boolean }) {
  const start = Math.floor((BACKGROUND_COMMANDS.length / COLUMN_COUNT) * index);
  const lines = useTerminalStream(BACKGROUND_COMMANDS, start, { ...TIMING, startDelay: index * 400 }, enabled);
  // 画面より下にはみ出した行は捨てる（長時間開いていても重くならないように）
  const visible = lines.slice(-80);
  return (
    <div className="flex min-w-0 flex-1 flex-col justify-end overflow-hidden px-2 sm:px-3">
      <TerminalLines lines={visible} cursorClassName="h-[12px] w-[5px]" />
    </div>
  );
}

/**
 * 背景に CLI のコマンドが流れる演出（旧サイトの TerminalBackground と同じコマンド・速さ）。
 * 文字は薄く、本文の読みやすさを邪魔しない。動きを減らす設定では止める
 */
export function TerminalBackground() {
  const reduced = usePrefersReducedMotion();
  if (reduced) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 select-none overflow-hidden">
      <div className="absolute inset-0 flex flex-row pt-20 font-mono text-[9px] leading-relaxed opacity-[0.13] sm:text-[10px] md:text-xs">
        {Array.from({ length: COLUMN_COUNT }, (_, i) => (
          <Column key={i} index={i} enabled />
        ))}
      </div>
      {/* 下に向かって少し暗くし、本文の下の文字を沈ませる */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background-full/40 to-background-full" />
    </div>
  );
}
