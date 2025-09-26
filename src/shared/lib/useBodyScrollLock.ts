"use client";

import { useEffect } from "react";

let lockCount = 0;
let savedScrollY = 0;
let savedBodyStyles: {
  position?: string;
  top?: string;
  left?: string;
  right?: string;
  width?: string;
  overflowY?: string;
} | null = null;
let savedTouchAction: string = "";
let savedHtmlOverscrollY: string | null = null;

export function useBodyScrollLock(locked: boolean = true) {
  useEffect(() => {
    if (!locked) return;

    const body = document.body as HTMLBodyElement;
    const html = document.documentElement as HTMLElement;

    if (lockCount === 0) {
      savedScrollY = window.scrollY || window.pageYOffset || 0;
      savedBodyStyles = {
        position: body.style.position,
        top: body.style.top,
        left: body.style.left,
        right: body.style.right,
        width: body.style.width,
        overflowY: body.style.overflowY,
      };
      savedTouchAction = body.style.getPropertyValue("touch-action");
      savedHtmlOverscrollY = html.style.getPropertyValue("overscroll-behavior-y") || "";

      body.style.position = "fixed";
      body.style.top = `-${savedScrollY}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.width = "100%";
      body.style.overflowY = "scroll";
      body.style.setProperty("touch-action", "none");
      html.style.setProperty("overscroll-behavior-y", "contain");
    }

    lockCount++;

    return () => {
      lockCount--;
      if (lockCount === 0) {
        if (savedBodyStyles) {
          body.style.position = savedBodyStyles.position || "";
          body.style.top = savedBodyStyles.top || "";
          body.style.left = savedBodyStyles.left || "";
          body.style.right = savedBodyStyles.right || "";
          body.style.width = savedBodyStyles.width || "";
          body.style.overflowY = savedBodyStyles.overflowY || "";
          if (savedTouchAction) {
            body.style.setProperty("touch-action", savedTouchAction);
          } else {
            body.style.removeProperty("touch-action");
          }
        }
        if (savedHtmlOverscrollY != null) {
          if (savedHtmlOverscrollY) {
            html.style.setProperty("overscroll-behavior-y", savedHtmlOverscrollY);
          } else {
            html.style.removeProperty("overscroll-behavior-y");
          }
        }
        window.scrollTo(0, savedScrollY);
        savedBodyStyles = null;
      }
    };
  }, [locked]);
}


