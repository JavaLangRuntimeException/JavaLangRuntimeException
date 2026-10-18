#!/usr/bin/env node
/**
 * Regenerate docs/images/*.png from docs/diagrams/*.html
 * Run: npm exec --prefix frontend -- node docs/diagrams/render.mjs
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(root, "../..");
const { chromium } = await import(
  pathToFileURL(path.join(repoRoot, "frontend/node_modules/playwright/index.mjs")).href
);
const outDir = path.join(repoRoot, "docs/images");

const diagrams = [
  "tech",
  "cicd",
  "environments",
  "backend-services",
  "backend-layers",
  "frontend",
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.setViewportSize({ width: 2560, height: 1600 });

// 引数で名前を渡すと、その図だけ書き出す（例: node docs/diagrams/render.mjs tech cicd）
const only = process.argv.slice(2);
for (const name of diagrams.filter((d) => only.length === 0 || only.includes(d))) {
  const htmlPath = path.join(root, `${name}.html`);
  const fileUrl = `file://${htmlPath}`;
  await page.goto(fileUrl, { waitUntil: "load" });
  await page.waitForTimeout(100);

  // 矢印は各ページの _arrows.js が箱の位置を測って引く
  await page.waitForFunction(() => window.__arrowsDone === true);

  const box = await page.locator(".page").boundingBox();
  if (!box) throw new Error(`No .page in ${name}.html`);
  await page.screenshot({
    path: path.join(outDir, `${name}.png`),
    clip: {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    },
  });
  console.log(`wrote ${name}.png (${Math.round(box.width)}×${Math.round(box.height)})`);
}

await browser.close();
