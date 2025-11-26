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

  return <Header />;
}
