import { createContext, useContext, useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

/** 経過時間（ms）。active の間だけ、until を過ぎるまで毎フレーム更新する */
export function useElapsed(active: boolean, until = Infinity) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!active) return;
    const start = performance.now();
    let id = requestAnimationFrame(function tick(now) {
      const t = now - start;
      setElapsed(t);
      if (t < until) id = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(id);
  }, [active, until]);
  // 止まったら 0 に戻す（次に動き出したときに最初から）
  return active ? elapsed : 0;
}

// Still（still.tsx）の中かどうか
export const StillContext = createContext(false);

/** 演出を止めるか（Still の中、または動きを減らす設定） */
export function useStill() {
  const reduced = useReducedMotion();
  const still = useContext(StillContext);
  return still || Boolean(reduced);
}
