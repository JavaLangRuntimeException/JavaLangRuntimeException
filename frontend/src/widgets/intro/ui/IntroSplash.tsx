import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useSetAtom } from "jotai";
import { tagline } from "@/entities/profile";
import { introPlayingAtom } from "@/shared/model/intro";
import { CURTAIN_EASE, DecodeChars, EASE, useElapsed } from "@/shared/ui/motion";

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
  // コマンドを打ち終えたら jar を読み込む（ログが流れ、バーが伸び、起動して幕が開く）
  load: 1100,
  loaded: 4100,
  exit: 4700,
};

// 読み込みのログ（コマンドの下に、時間が来たものから出す）
const LOAD_LOG: { at: number; text: string }[] = [
  { at: T.load, text: "Unpacking taramanji.jar" },
  { at: T.load + 350, text: "Loading jp.taramanji.engineer" },
  { at: T.load + 1000, text: "Loading jp.taramanji.researcher" },
  { at: T.load + 1650, text: "Loading jp.taramanji.photographer" },
  { at: T.load + 2300, text: "Loading jp.taramanji.community" },
];
const CLASS_COUNT = 447;
const BAR_CELLS = 24;

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

/** キャッチコピーの 1 行（記号から左→右へ 1 文字ずつ定まる） */
function DecodeLine({ text, accent, start, elapsed }: { text: string; accent: [number, number]; start: number; elapsed: number }) {
  return (
    <span aria-hidden="true" className="block whitespace-nowrap text-text-primary">
      <DecodeChars text={text} accent={accent} start={start} elapsed={elapsed} timing={{ stagger: T.charStagger, settle: T.charSettle }} />
    </span>
  );
}

/** 打ち込んだコマンドの下に流れる読み込みのログと、伸びていくバー */
function LoadingLog({ elapsed }: { elapsed: number }) {
  if (elapsed < T.load) return null;
  const p = Math.min(1, (elapsed - T.load) / (T.loaded - T.load));
  // 最初は速く、終わりはゆっくり（読み込みらしく）
  const eased = 1 - Math.pow(1 - p, 2.2);
  const filled = Math.round(eased * BAR_CELLS);
  const logs = LOAD_LOG.filter((l) => elapsed >= l.at).slice(-3);
  return (
    <div className="mt-1 flex flex-col">
      {logs.map((l) => (
        <span key={l.text} className="truncate">
          {l.text}
        </span>
      ))}
      <span className="whitespace-pre">
        <span className="text-text-secondary">{"█".repeat(filled)}</span>
        <span className="text-text-tertiary/50">{"░".repeat(BAR_CELLS - filled)}</span>
        {`  ${String(Math.round(eased * 100)).padStart(3)}%  ${String(Math.round(eased * CLASS_COUNT)).padStart(3)}/${CLASS_COUNT} classes`}
      </span>
      {p >= 1 && (
        <span>
          <span className="text-emerald-400">Started</span> taramanji in {(T.loaded / 1000).toFixed(1)}s
        </span>
      )}
    </div>
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
  const setPlaying = useSetAtom(introPlayingAtom);

  // 幕が開くまでは、トップのキャッチコピーを動かさない
  useLayoutEffect(() => {
    setPlaying(active);
  }, [active, setPlaying]);

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
          transition={{ duration: 0.75, ease: CURTAIN_EASE }}
        >
          {/* 上端: 打ち込まれるコマンド */}
          <div aria-hidden="true" className="px-4 pt-6 font-mono text-[0.8125rem] text-text-tertiary sm:px-10 sm:pt-8">
            <span className="text-emerald-400">$</span>
            <span className="text-text-secondary"> {typed}</span>
            {/* 読み込みが始まったらカーソルは消す */}
            {elapsed < T.load && (
              <span className={`ms-px inline-block h-[1em] w-[0.5em] translate-y-[0.15em] bg-emerald-400/80 ${typing ? "" : "animate-pulse"}`} />
            )}
            <LoadingLog elapsed={elapsed} />
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
