// 文字のコントラスト（WCAG 2.x）を全ページで確かめる。4.5:1 未満（大きい文字は 3:1 未満）を報告する
//   node scripts/check-contrast.mjs [baseURL]   （既定は http://localhost:5173）
// 背景は祖先の背景色を重ねて求め、opacity も掛ける。aria-hidden の飾り・無効なボタン・見えない要素は除く
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:5173";
const pages = ["/", "/link", "/blogs", "/contact", "/reserve", "/location", "/calendar-sync", "/privacy"];

const browser = await chromium.launch();
let total = 0;
for (const path of pages) {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    await page.goto(base + path, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const bad = await page.evaluate(() => {
      // oklch() など何の形式でも、キャンバスに塗って読み戻せば sRGB の値になる
      const ctx = Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d", { willReadFrequently: true });
      const cache = new Map();
      const parse = (c) => {
        if (cache.has(c)) return cache.get(c);
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = "rgba(0,0,0,0)";
        ctx.fillStyle = c;
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        const v = [d[0], d[1], d[2], d[3] / 255];
        cache.set(c, v);
        return v;
      };
      const over = (top, bottom) => {
        const a = top[3] + bottom[3] * (1 - top[3]);
        if (a === 0) return [0, 0, 0, 0];
        return [0, 1, 2].map((i) => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a).concat(a);
      };
      const lum = ([r, g, b]) => {
        const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const bgOf = (el) => {
        const chain = [];
        for (let e = el; e; e = e.parentElement) chain.push(e);
        let bg = [14, 14, 16, 1];
        for (const e of chain.reverse()) {
          const c = parse(getComputedStyle(e).backgroundColor);
          if (c[3] > 0) bg = over(c, bg);
        }
        return bg;
      };
      const opacityOf = (el) => {
        let o = 1;
        for (let e = el; e; e = e.parentElement) o *= +getComputedStyle(e).opacity;
        return o;
      };
      const out = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const seen = new Set();
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.textContent.trim();
        const el = n.parentElement;
        if (!text || !el || seen.has(el)) continue;
        seen.add(el);
        if (el.closest('[aria-hidden="true"], .sr-only, :disabled, [aria-disabled="true"], [data-disabled]')) continue;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (r.width === 0 || r.height === 0 || cs.visibility === "hidden" || cs.display === "none") continue;
        const fg0 = parse(cs.color);
        const bg = bgOf(el);
        const fg = over([fg0[0], fg0[1], fg0[2], fg0[3] * opacityOf(el)], bg);
        const l1 = lum(fg), l2 = lum(bg);
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        const size = parseFloat(cs.fontSize);
        const large = size >= 24 || (size >= 18.66 && +cs.fontWeight >= 700);
        if (ratio < (large ? 3 : 4.5)) out.push(`${ratio.toFixed(2)}  ${size}px  "${text.slice(0, 40)}"  <${el.tagName.toLowerCase()} class="${(el.className || "").toString().slice(0, 80)}">`);
      }
      return out;
    });
    for (const b of bad) console.log(`${path} @${width}: ${b}`);
    total += bad.length;
    await page.close();
  }
}
await browser.close();
console.log(total === 0 ? "contrast: OK" : `contrast: ${total} 件`);
process.exit(total === 0 ? 0 : 1);
