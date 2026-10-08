import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { tagline } from "@/entities/profile";

// 1 回のセッションで 1 度だけ出す
const SEEN_KEY = "intro-seen";

const COMMAND = "java -jar taramanji.jar";
const COPY = tagline.lines;
const SUBTITLE = tagline.subtitle;

// 時間（ms）
const T = {
  typeStart: 250,
  typePerChar: 32,
  lines: [1150, 1650],
  charStagger: 70,
  charSettle: 300,
  rule: 2550,
  subtitle: 2750,
  exit: 4700,
};

// 文字が定まるまでに流れる記号（全角でそろえ、幅が揺れないようにする）
const GLYPHS = "アイウエオカキクケコサシスセソタチツテトナニヌネノ０１＜＞／＝＋＊＃％｛｝";
const EASE = [0.22, 1, 0.36, 1] as const;

function shouldShow() {
  try {
    return sessionStorage.getItem(SEEN_KEY) === null;
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    sessionStorage.setItem(SEEN_KEY, "1");
  } catch {
    // 保存できなくても演出は終える
  }
}

/** 表示し始めてからの経過時間（ms）。毎フレーム更新する */
function useElapsed(active: boolean) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!active) return;
    const start = performance.now();
    let id = requestAnimationFrame(function tick(now) {
      setElapsed(now - start);
      id = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(id);
  }, [active]);
  return elapsed;
}

/** 1 文字ずつ記号が流れ、左から順に本来の文字に定まる */
function DecodeLine({ text, accent, start, elapsed }: { text: string; accent: [number, number]; start: number; elapsed: number }) {
  const bucket = Math.floor(elapsed / 55);
  return (
    <span aria-hidden="true" className="block whitespace-nowrap">
      {Array.from(text).map((ch, i) => {
        const t = elapsed - start - i * T.charStagger;
        const isAccent = i >= accent[0] && i < accent[1];
        if (t < 0) {
          return (
            <span key={i} className="opacity-0">
              {ch}
            </span>
          );
        }
        if (t < T.charSettle && ch !== "、" && ch !== "。") {
          return (
            <span key={i} className="text-text-tertiary">
              {GLYPHS[(i * 7 + bucket * 13 + i * bucket) % GLYPHS.length]}
            </span>
          );
        }
        return (
          <span key={i} className={isAccent ? "text-accent-300" : "text-text-primary"}>
            {ch}
          </span>
        );
      })}
    </span>
  );
}

/**
 * サイトの入り口の演出。ターミナルでコマンドを打つと、キャッチコピーが記号から 1 文字ずつ定まって現れ、
 * 最後に幕が上へ開いてトップページが見える。スキップ（ボタン・Esc・Enter）でき、動きを減らす設定では出さない
 */
export function IntroSplash() {
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(() => shouldShow());
  const active = visible && !reduced;
  const elapsed = useElapsed(active);

  const finish = useCallback(() => {
    markSeen();
    setVisible(false);
  }, []);

  // 演出中は後ろのページをスクロールさせず、時間が来たら幕を開ける
  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(finish, T.exit);
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      root.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [active, finish]);

  const typed = COMMAND.slice(0, Math.max(0, Math.floor((elapsed - T.typeStart) / T.typePerChar)));
  const typing = typed.length < COMMAND.length;

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="intro"
          role="dialog"
          aria-modal="true"
          aria-label="イントロ"
          className="fixed inset-0 z-[100] flex flex-col bg-background-full"
          initial={{ clipPath: "inset(0% 0% 0% 0%)" }}
          exit={{ clipPath: "inset(0% 0% 100% 0%)" }}
          transition={{ duration: 0.75, ease: [0.76, 0, 0.24, 1] }}
        >
          {/* 上端: 打ち込まれるコマンド */}
          <div aria-hidden="true" className="px-4 pt-6 font-mono text-[0.8125rem] text-text-tertiary sm:px-10 sm:pt-8">
            <span className="text-emerald-400">$</span>
            <span className="text-text-secondary"> {typed}</span>
            <span
              className={`ms-px inline-block h-[1em] w-[0.5em] translate-y-[0.15em] bg-emerald-400/80 ${typing ? "" : "animate-pulse"}`}
            />
          </div>

          {/* 中央: キャッチコピーとサブタイトル */}
          <div className="flex flex-1 items-center px-4 sm:px-10">
            <div className="mx-auto w-full max-w-5xl">
              <p className="sr-only">
                {COPY.map((l) => l.text).join("")} {SUBTITLE}
              </p>
              <p className="text-[clamp(2.25rem,8.5vw,5rem)] font-semibold leading-[1.25] tracking-[0.01em] [font-feature-settings:'palt'_1]">
                {COPY.map((line, i) => (
                  <DecodeLine key={line.text} text={line.text} accent={line.accent} start={T.lines[i]} elapsed={elapsed} />
                ))}
              </p>
              <motion.div
                aria-hidden="true"
                className="mt-8 h-px origin-left bg-accent-400"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: elapsed >= T.rule ? 1 : 0 }}
                transition={{ duration: 0.7, ease: EASE }}
              />
              <motion.p
                aria-hidden="true"
                className="mt-6 text-[clamp(0.9375rem,2.4vw,1.25rem)] leading-[1.8] tracking-[0.04em] text-text-secondary [word-break:auto-phrase]"
                initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
                animate={elapsed >= T.subtitle ? { opacity: 1, y: 0, filter: "blur(0px)" } : undefined}
                transition={{ duration: 0.7, ease: EASE }}
              >
                {SUBTITLE}
              </motion.p>
            </div>
          </div>

          {/* 下端: 名前とスキップ */}
          <div className="flex items-end justify-between gap-4 px-4 pb-6 font-mono text-[0.8125rem] sm:px-10 sm:pb-8">
            <span aria-hidden="true" className="text-text-tertiary">
              JavaLangRuntimeException
            </span>
            <button
              type="button"
              onClick={finish}
              className="press rounded-sm px-2 py-1 text-text-secondary outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
            >
              スキップ
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
