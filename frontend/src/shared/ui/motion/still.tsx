import type { ReactNode } from "react";
import { StillContext } from "./hooks";

/**
 * 中の演出（ぼかしから浮かぶ・フェード・線が伸びる・幕が開く）を止め、最初から出しておく範囲。
 * 動きを減らす設定と同じ見え方になる（論文のプロジェクトページなど、読ませるページで使う）
 */
export function Still({ children }: { children: ReactNode }) {
  return <StillContext value={true}>{children}</StillContext>;
}
