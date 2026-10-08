import { useEffect, useState } from "react";
import { useLocation, useOutlet } from "react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { IntroSplash } from "@/widgets/intro";
import { SiteHeader } from "@/widgets/site-header";
import { sendPageview } from "@/shared/lib/pageview";
import { TerminalBackground } from "@/shared/ui/terminal";

// ヘッダーを出さないページ（旧 ConditionalHeader と同じ）
const NO_HEADER = ["/questionnaire"];
// 背景に CLI のコマンドが流れるページ（旧 HeroBackground を使っていたページ）
const TERMINAL_PAGES = ["/", "/link", "/blogs", "/portfolio", "/contact", "/location", "/reserve"];

const EASE = [0.22, 1, 0.36, 1] as const;

export function SiteLayout() {
  const { pathname, hash } = useLocation();
  const outlet = useOutlet();
  const reduced = useReducedMotion();
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  // 入り口の演出はトップから入ったときだけ（途中でトップへ移っても出さない）
  const [enteredAtHome] = useState(() => pathname === "/");

  useEffect(() => {
    sendPageview(pathname);
  }, [pathname]);

  // 画面が変わったら先頭へ。#id 付きならその見出しへ（/privacy#en など）
  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }
    const id = decodeURIComponent(hash.slice(1));
    // 遅延読み込みとページ遷移の演出が終わるのを待つ
    let tries = 0;
    const timer = window.setInterval(() => {
      const el = document.getElementById(id);
      if (el || ++tries > 40) {
        window.clearInterval(timer);
        el?.scrollIntoView();
      }
    }, 50);
    return () => window.clearInterval(timer);
  }, [pathname, hash]);

  return (
    <div className="relative min-h-dvh bg-background-full">
      {enteredAtHome && <IntroSplash />}
      {TERMINAL_PAGES.includes(pathname) && <TerminalBackground />}
      {!isAdmin && !NO_HEADER.includes(pathname) && <SiteHeader />}
      {/* ページ遷移: 前のページはふっと消え、次のページはぼかしから浮かび上がる */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={pathname}
          className="relative z-10"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 14, filter: "blur(8px)" }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)", transitionEnd: { filter: "none", transform: "none" } }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8, filter: "blur(4px)" }}
          transition={{ duration: reduced ? 0.12 : 0.28, ease: EASE }}
        >
          {outlet}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
