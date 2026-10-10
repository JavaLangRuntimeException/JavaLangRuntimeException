import { useEffect, useRef, type ReactNode } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { glyphFor, KEEP } from "./glyphs";
import { EASE } from "./variants";

// 中身（任意の要素）の短い文字（カードの題名・ラベルなど）を、見出しと同じく記号から 1 文字ずつ定まって出す。
// 長い文（説明文など）は記号にせず、全体のフェードだけで出す（全部を記号にすると騒がしい）。
// 子の作りに手を入れずに済むよう、描かれた文字（テキストノード）を直接書き換え、終わったら元に戻す

const VIEWPORT = { once: true, margin: "0px 0px -10% 0px" } as const;
// 書き換えない要素（入力欄や、見出しの DecodeText のように自前で動かしているもの）
const SKIP = "script, style, textarea, input, select, option, pre, code, .sr-only, [data-decode]";
// 記号にするのはこの文字数までの短い文字だけ
const MAX_CHARS = 20;
// 1 つ目が動き出してから、最後が動き出すまでの上限（数が多くても長く待たせない）
const LINE_STAGGER = 30;
const LINE_STAGGER_TOTAL = 360;
// 1 つの中で、先頭から最後の文字が定まり始めるまでの上限
const CHAR_STAGGER = 18;
const CHAR_STAGGER_TOTAL = 260;
const SETTLE = 140;

type Line = { node: Text; original: string; chars: string[]; written: string; start: number; step: number; offset: number };

/** root の中の文字を記号にし、先頭から順に元の文字へ戻していく。戻す関数を返す */
function scramble(root: HTMLElement, delay: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const text = n.nodeValue?.trim() ?? "";
      return text && Array.from(text).length <= MAX_CHARS && !n.parentElement?.closest(SKIP) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const lines: Line[] = [];
  let offset = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const node = n as Text;
    const chars = Array.from(node.nodeValue ?? "");
    const k = lines.length;
    lines.push({
      node,
      original: node.nodeValue ?? "",
      chars,
      written: node.nodeValue ?? "",
      start: delay + Math.min(k * LINE_STAGGER, LINE_STAGGER_TOTAL),
      step: Math.min(CHAR_STAGGER, CHAR_STAGGER_TOTAL / chars.length),
      offset,
    });
    offset += chars.length;
  }
  if (lines.length === 0) return () => {};

  const write = (line: Line, text: string) => {
    line.node.nodeValue = text;
    line.written = text;
  };
  let pending = lines;
  const begin = performance.now();
  const frame = (now: number) => {
    const t = now - begin;
    const bucket = Math.floor(t / 55);
    pending = pending.filter((line) => {
      // 途中で React が文字を差し替えたら、そちらを正として手を引く
      if (line.node.nodeValue !== line.written) return false;
      const elapsed = t - line.start;
      const text = line.chars
        .map((ch, i) => (KEEP.has(ch) || /\s/.test(ch) || elapsed - i * line.step >= SETTLE ? ch : glyphFor(ch, line.offset + i, bucket)))
        .join("");
      write(line, text);
      return text !== line.original;
    });
  };
  // 最初の 1 枚は今すぐ記号にする（見え始めた瞬間に元の文字がちらつかないように）
  frame(begin);
  root.setAttribute("aria-busy", "true");
  let id = requestAnimationFrame(function tick(now) {
    frame(now);
    if (pending.length > 0) id = requestAnimationFrame(tick);
    else root.removeAttribute("aria-busy");
  });
  return () => {
    cancelAnimationFrame(id);
    for (const line of pending) if (line.node.nodeValue === line.written) write(line, line.original);
    root.removeAttribute("aria-busy");
  };
}

/**
 * 中身の文字がパラパラと定まって現れる（線や画像などは静かにフェード）。
 * show を渡さなければ画面に入ったとき、渡せば show が true になったとき。動きを減らす設定では最初から出す
 */
export function DecodeReveal({ children, className, delay = 0, show }: { children: ReactNode; className?: string; delay?: number; show?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, VIEWPORT);
  const reduced = Boolean(useReducedMotion());
  const visible = reduced || (show ?? inView);

  useEffect(() => {
    const root = ref.current;
    if (!visible || reduced || !root) return;
    return scramble(root, delay * 1000);
  }, [visible, reduced, delay]);

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0 }}
      animate={{ opacity: visible ? 1 : 0 }}
      transition={visible && !reduced ? { duration: 0.35, ease: EASE, delay } : { duration: 0 }}
    >
      {children}
    </motion.div>
  );
}
