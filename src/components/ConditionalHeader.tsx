"use client";

import React from "react";
import { Header } from "./Header";
import { useIntro } from "../shared/contexts/IntroContext";
import { usePathname } from "next/navigation";

export function ConditionalHeader() {
  const { introCompleted } = useIntro();
  const pathname = usePathname();

  // welcome画面が完了した後にヘッダーを表示
  if (!introCompleted && pathname === "/") {
    return null;
  }

  // /reserve-researchページではヘッダーを非表示
  if (pathname === "/reserve-research") {
    return null;
  }

  if (pathname === "/questionnaire") {
    return null;
  }

  // 管理画面は独自のヘッダーを持つ（gws.taramanji.com では外部ページへのリンク先読みが転送で失敗するため）
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return null;
  }

  return <Header />;
}
