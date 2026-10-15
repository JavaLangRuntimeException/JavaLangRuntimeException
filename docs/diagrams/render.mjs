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

for (const name of diagrams) {
  const htmlPath = path.join(root, `${name}.html`);
  const fileUrl = `file://${htmlPath}`;
  await page.goto(fileUrl, { waitUntil: "load" });
  await page.waitForTimeout(100);

  if (name === "tech") {
    await page.evaluate(() => {
      const pageEl = document.querySelector(".tech-page");
      const svg = document.getElementById("link-layer");
      if (!pageEl || !svg) return;

      const pr = pageEl.getBoundingClientRect();
      const pt = (el, anchor) => {
        const r = el.getBoundingClientRect();
        const cx = r.left - pr.left + r.width / 2;
        const cy = r.top - pr.top + r.height / 2;
        let x = cx;
        let y = cy;
        if (anchor === "top") y = r.top - pr.top;
        if (anchor === "bottom") y = r.bottom - pr.top;
        if (anchor === "left") x = r.left - pr.left;
        if (anchor === "right") x = r.right - pr.left;
        return { x, y };
      };

      const links = [
        { from: "argo-card", fromAnchor: "top", to: "kind-box", toAnchor: "bottom", label: "GitOps 同期" },
        { from: "kind-box", fromAnchor: "bottom", to: "dd-card", toAnchor: "top", label: "テレメトリ" },
        { from: "ts-card", fromAnchor: "top", to: "kind-box", toAnchor: "bottom", label: "SSH" },
        { from: "kind-box", fromAnchor: "bottom", to: "ses-card", toAnchor: "top", label: "SendEmail API" },
        { from: "workers-card", fromAnchor: "bottom", to: "ses-card", toAnchor: "top", label: "Webhook → SES", dashed: true },
        { from: "dd-card", fromAnchor: "top", to: "workers-card", toAnchor: "bottom", label: "アラート Webhook", dashed: true },
      ];

      const ns = "http://www.w3.org/2000/svg";
      for (const link of links) {
        const a = document.getElementById(link.from);
        const b = document.getElementById(link.to);
        if (!a || !b) continue;
        const p1 = pt(a, link.fromAnchor);
        const p2 = pt(b, link.toAnchor);
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const cx = mx - dy * 0.12;
        const cy = my + dx * 0.12;

        const path = document.createElementNS(ns, "path");
        path.setAttribute("d", `M ${p1.x} ${p1.y} Q ${cx} ${cy} ${p2.x} ${p2.y}`);
        if (link.dashed) path.setAttribute("class", "dashed");
        svg.appendChild(path);

        const text = document.createElementNS(ns, "text");
        text.setAttribute("x", String(cx));
        text.setAttribute("y", String(cy - 4));
        text.setAttribute("text-anchor", "middle");
        text.textContent = link.label;
        svg.appendChild(text);
      }
    });
  }

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
