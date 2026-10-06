import type { TerminalLine } from "./use-terminal-stream";

// ターミナルの見た目。プロンプトの緑はターミナルの配色（セマンティックトークンの例外。CLAUDE.md 参照）
export function TerminalLines({ lines, cursorClassName = "h-[1em] w-[0.45em]" }: { lines: TerminalLine[]; cursorClassName?: string }) {
  return (
    <>
      {lines.map((line) => (
        <div key={line.id} className="truncate whitespace-pre">
          {line.type === "prompt" ? (
            <span>
              <span className="text-emerald-400">$</span>
              <span className="text-text-primary"> {line.text}</span>
              {line.isTyping && <span className={`ms-px inline-block animate-pulse bg-emerald-400/80 align-middle ${cursorClassName}`} />}
            </span>
          ) : (
            <span className="text-text-tertiary">{line.text}</span>
          )}
        </div>
      ))}
    </>
  );
}
