import { useEffect, useRef, useState } from "react";
import type { CommandEntry } from "./commands";

export type TerminalLine = {
  id: number;
  type: "prompt" | "output";
  text: string;
  isTyping?: boolean;
};

type Timing = { typing: number; afterCommand: number; outputLine: number; pause: number; startDelay?: number; maxLines?: number };

/** コマンドを 1 文字ずつ打ち、出力を流し、次のコマンドへ…を繰り返す（旧実装と同じ動き） */
export function useTerminalStream(commands: CommandEntry[], startIndex: number, timing: Timing, enabled = true) {
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const idRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const nextId = () => ++idRef.current;
    const sleep = (ms: number) => new Promise<void>((resolve) => (cancelled ? resolve() : setTimeout(resolve, ms)));
    const clip = (next: TerminalLine[]) => (timing.maxLines && next.length > timing.maxLines ? next.slice(next.length - timing.maxLines) : next);

    const run = async () => {
      await sleep(timing.startDelay ?? 0);
      let index = startIndex;
      while (!cancelled) {
        const entry = commands[index % commands.length];
        const id = nextId();
        setLines((prev) => clip([...prev, { id, type: "prompt", text: "", isTyping: true }]));
        for (let i = 0; i <= entry.command.length && !cancelled; i++) {
          const partial = entry.command.slice(0, i);
          setLines((prev) => prev.map((l) => (l.id === id ? { ...l, text: partial } : l)));
          await sleep(timing.typing);
        }
        setLines((prev) => prev.map((l) => (l.id === id ? { ...l, isTyping: false } : l)));
        await sleep(timing.afterCommand);
        for (const out of entry.output) {
          if (cancelled) return;
          const outId = nextId();
          setLines((prev) => clip([...prev, { id: outId, type: "output", text: out }]));
          await sleep(timing.outputLine);
        }
        await sleep(timing.pause);
        index++;
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [commands, startIndex, enabled, timing.typing, timing.afterCommand, timing.outputLine, timing.pause, timing.startDelay, timing.maxLines]);

  return lines;
}
