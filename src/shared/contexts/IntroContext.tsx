"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

interface IntroContextType {
  showIntro: boolean;
  introCompleted: boolean;
  setIntroCompleted: (completed: boolean) => void;
}

const IntroContext = createContext<IntroContextType | undefined>(undefined);

export function IntroProvider({ children }: { children: React.ReactNode }) {
  const [showIntro, setShowIntro] = useState(false);
  const [introCompleted, setIntroCompleted] = useState(false);

  useEffect(() => {
    // 内部ナビゲーションかどうかをチェック
    const isInternalNavigation = sessionStorage.getItem('internal_navigation') === 'true';
    const introShown = sessionStorage.getItem('intro_shown') === '1';

    // 内部ナビゲーションの場合、またはイントロが既に表示済みの場合はアニメーションを無効化
    if (isInternalNavigation || introShown) {
      setIntroCompleted(true); // イントロが不要な場合は即座に完了状態にする
    } else {
      // 直接アクセスまたは外部リンクからの場合はイントロを表示
      setShowIntro(true);
    }

    // 内部ナビゲーションフラグをクリア
    sessionStorage.removeItem('internal_navigation');
  }, []);

  return (
    <IntroContext.Provider value={{ showIntro, introCompleted, setIntroCompleted }}>
      {children}
    </IntroContext.Provider>
  );
}

export function useIntro() {
  const context = useContext(IntroContext);
  if (context === undefined) {
    throw new Error('useIntro must be used within an IntroProvider');
  }
  return context;
}
