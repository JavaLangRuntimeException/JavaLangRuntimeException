"use client";

import React from "react";
import { Header } from "./Header";
import { useIntro } from "../shared/contexts/IntroContext";

export function ConditionalHeader() {
  const { introCompleted } = useIntro();

  // welcome画面が完了した後にヘッダーを表示
  if (!introCompleted) {
    return null;
  }

  return <Header />;
}
