"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** ページを表示するたびに、アクセス数（Datadog の web.pageviews）を数えるための通知を送る */
export function PageviewBeacon() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin")) return;
    const body = JSON.stringify({ path: pathname });
    try {
      if (!navigator.sendBeacon?.("/api/metrics/pageview", new Blob([body], { type: "application/json" }))) {
        fetch("/api/metrics/pageview", { method: "POST", body, keepalive: true }).catch(() => {});
      }
    } catch {
      // 計測の失敗で画面は止めない
    }
  }, [pathname]);
  return null;
}
