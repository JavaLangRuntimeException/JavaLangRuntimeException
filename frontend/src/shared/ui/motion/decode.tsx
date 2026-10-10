import { useEffect, useRef } from "react";
import { useInView, useReducedMotion } from "motion/react";
import { cx } from "@/utils/cx";
import { glyphFor, KEEP } from "./glyphs";
import { useElapsed } from "./hooks";

// 入り口の演出（widgets/intro）と同じ「記号から 1 文字ずつ定まる」表現。見出しをスクロールで見せるときにも使う

type DecodeTiming = { stagger: number; settle: number };

/** 1 文字分の見た目。まだ出ていない文字は場所だけ取って透明にする */
export function DecodeChars({
  text,
  elapsed,
  start = 0,
  accent,
  timing = { stagger: 45, settle: 260 },
  accentClassName = "text-accent-300",
  glyphClassName = "text-text-tertiary",
}: {
  text: string;
  elapsed: number;
  start?: number;
  accent?: [number, number];
  timing?: DecodeTiming;
  accentClassName?: string;
  glyphClassName?: string;
}) {
  const bucket = Math.floor(elapsed / 55);
  return (
    <>
      {Array.from(text).map((ch, i) => {
        const t = elapsed - start - i * timing.stagger;
        const isAccent = accent !== undefined && i >= accent[0] && i < accent[1];
        if (t <= 0) {
          return (
            <span key={i} className="opacity-0">
              {ch}
            </span>
          );
        }
        if (t < timing.settle && !KEEP.has(ch)) {
          return (
            <span key={i} className={glyphClassName}>
              {glyphFor(ch, i, bucket)}
            </span>
          );
        }
        return (
          <span key={i} className={isAccent ? accentClassName : undefined}>
            {ch}
          </span>
        );
      })}
    </>
  );
}

/**
 * 画面に入ったら、記号から 1 文字ずつ定まって現れる文字。スクリーンリーダーには全文をそのまま読ませる。
 * ready が false の間は待つ（入り口の演出の幕が開くのを待つときなど）。動きを減らす設定ではそのまま出す
 */
export function DecodeText({
  text,
  accent,
  className,
  delay = 0,
  ready = true,
  timing = { stagger: 45, settle: 260 },
  onShown,
}: {
  text: string;
  accent?: [number, number];
  className?: string;
  delay?: number;
  ready?: boolean;
  timing?: DecodeTiming;
  /** 最後の文字まで出たとき（定まりきる少し前）に 1 回呼ぶ。見出しのあとに中身を出すのに使う */
  onShown?: () => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -8% 0px" });
  const reduced = useReducedMotion();
  const total = delay + Array.from(text).length * timing.stagger + timing.settle;
  const active = inView && ready;
  const elapsed = useElapsed(active && !reduced, total);
  const shown = active && (reduced || elapsed >= delay + Array.from(text).length * timing.stagger);
  // 呼び出し側は状態を true にするだけなので、何度呼ばれても同じ
  useEffect(() => {
    if (shown) onShown?.();
  }, [shown, onShown]);

  if (reduced) {
    return (
      <span ref={ref} className={className}>
        {accent ? (
          <>
            {text.slice(0, accent[0])}
            <span className="text-accent-300">{text.slice(accent[0], accent[1])}</span>
            {text.slice(accent[1])}
          </>
        ) : (
          text
        )}
      </span>
    );
  }

  const done = elapsed >= total;
  return (
    <span ref={ref} data-decode className={cx("relative", className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {done && !accent ? text : <DecodeChars text={text} elapsed={elapsed} start={delay} accent={accent} timing={timing} />}
      </span>
    </span>
  );
}
