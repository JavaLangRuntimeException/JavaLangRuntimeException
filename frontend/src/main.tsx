import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app/App";
import { initRum } from "@/app/providers/rum";
import "@/app/styles.css";
import { reloadOnceForStaleChunk } from "@/shared/lib/stale-chunk";

initRum();

// Vite が先読みするファイル（CSS など）が見つからないときも、同じく 1 回だけ読み直す
window.addEventListener("vite:preloadError", (event) => {
  if (reloadOnceForStaleChunk()) event.preventDefault();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
