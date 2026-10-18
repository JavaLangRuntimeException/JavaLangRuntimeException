// 図の矢印を、箱の位置を測ってから SVG で引く。
// 使い方: <script>window.LINKS = [...]</script><script src="_arrows.js"></script>
//
// LINKS の 1 本:
//   from / to   "id:side"（side は top・bottom・left・right）。"id:side@0.3" で辺の 30% の位置
//   fromAlign / toAlign  その点の位置を、別の要素の中心にそろえる（id）
//   route       "straight"（既定）・"h"（from の高さのまま横へ）・"v"（from の x のまま縦へ）・"hvh"・"vhv"
//   label       線の横に置く文字。labelSide は above・below・left・right、labelSeg で何番目の区間に置くか
//   logo        線の上に置く画像（src）。logoW・logoH で大きさ
//   color・dashed・width
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const GRAY = "#8b97ab";

  function anchor(page, spec, align) {
    const [id, rest] = spec.split(":");
    const [side, atStr] = (rest || "right").split("@");
    const at = atStr === undefined ? 0.5 : Number(atStr);
    const el = document.getElementById(id);
    if (!el) throw new Error(`no #${id}`);
    const pr = page.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const L = r.left - pr.left, T = r.top - pr.top, W = r.width, H = r.height;
    let p;
    if (side === "top") p = { x: L + W * at, y: T };
    else if (side === "bottom") p = { x: L + W * at, y: T + H };
    else if (side === "left") p = { x: L, y: T + H * at };
    else p = { x: L + W, y: T + H * at };
    if (align) {
      const a = document.getElementById(align).getBoundingClientRect();
      if (side === "top" || side === "bottom") p.x = a.left - pr.left + a.width / 2;
      else p.y = a.top - pr.top + a.height / 2;
    }
    return p;
  }

  function points(p1, p2, route) {
    if (route === "h") return [p1, { x: p2.x, y: p1.y }];
    if (route === "v") return [p1, { x: p1.x, y: p2.y }];
    if (route === "hvh") {
      const mx = (p1.x + p2.x) / 2;
      return [p1, { x: mx, y: p1.y }, { x: mx, y: p2.y }, p2];
    }
    if (route === "vhv") {
      const my = (p1.y + p2.y) / 2;
      return [p1, { x: p1.x, y: my }, { x: p2.x, y: my }, p2];
    }
    return [p1, p2];
  }

  // 角を丸めた折れ線
  function pathD(pts, r = 12) {
    const clean = pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) > 0.5);
    let d = `M ${clean[0].x} ${clean[0].y}`;
    for (let i = 1; i < clean.length - 1; i++) {
      const a = clean[i - 1], b = clean[i], c = clean[i + 1];
      const l1 = Math.hypot(b.x - a.x, b.y - a.y), l2 = Math.hypot(c.x - b.x, c.y - b.y);
      const rr = Math.min(r, l1 / 2, l2 / 2);
      const s = { x: b.x - ((b.x - a.x) / l1) * rr, y: b.y - ((b.y - a.y) / l1) * rr };
      const e = { x: b.x + ((c.x - b.x) / l2) * rr, y: b.y + ((c.y - b.y) / l2) * rr };
      d += ` L ${s.x} ${s.y} Q ${b.x} ${b.y} ${e.x} ${e.y}`;
    }
    const last = clean[clean.length - 1];
    return d + ` L ${last.x} ${last.y}`;
  }

  function draw() {
    const page = document.querySelector(".page");
    page.style.position = "relative";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "arrow-layer");
    Object.assign(svg.style, { position: "absolute", left: 0, top: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none", zIndex: 5 });
    const defs = document.createElementNS(NS, "defs");
    svg.appendChild(defs);
    page.appendChild(svg);
    const markers = {};
    const marker = (color) => {
      if (markers[color]) return markers[color];
      const id = `m${Object.keys(markers).length}`;
      const m = document.createElementNS(NS, "marker");
      m.setAttribute("id", id);
      m.setAttribute("viewBox", "0 0 10 10");
      m.setAttribute("refX", "9");
      m.setAttribute("refY", "5");
      m.setAttribute("markerWidth", "13");
      m.setAttribute("markerHeight", "13");
      m.setAttribute("markerUnits", "userSpaceOnUse");
      m.setAttribute("orient", "auto");
      m.setAttribute("overflow", "visible");
      const p = document.createElementNS(NS, "path");
      p.setAttribute("d", "M0,0.5 L10,5 L0,9.5 L2.5,5 Z");
      p.setAttribute("fill", color);
      m.appendChild(p);
      defs.appendChild(m);
      return (markers[color] = id);
    };

    for (const l of window.LINKS || []) {
      const color = l.color || GRAY;
      const p1 = anchor(page, l.from, l.fromAlign);
      const p2 = anchor(page, l.to, l.toAlign);
      if (l.route === "h") p2.y = p1.y;
      if (l.route === "v") p2.x = p1.x;
      const pts = points(p1, p2, l.route);
      const path = document.createElementNS(NS, "path");
      path.setAttribute("d", pathD(pts));
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", color);
      path.setAttribute("stroke-width", String(l.width || 2.25));
      path.setAttribute("stroke-linecap", "round");
      if (l.dashed) path.setAttribute("stroke-dasharray", "7 6");
      if (!l.noHead) path.setAttribute("marker-end", `url(#${marker(color)})`);
      svg.appendChild(path);

      if (!l.label && !l.logo) continue;
      // いちばん長い区間の真ん中に置く
      let best = 0, bl = -1;
      for (let i = 0; i < pts.length - 1; i++) {
        if (l.labelSeg !== undefined) { best = Math.min(l.labelSeg, pts.length - 2); break; }
        const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
        if (len > bl) { bl = len; best = i; }
      }
      const a = pts[best], b = pts[best + 1];
      const t = l.labelAt ?? 0.5;
      const mx = a.x + (b.x - a.x) * t, my = a.y + (b.y - a.y) * t;
      const vertical = Math.abs(b.x - a.x) < Math.abs(b.y - a.y);
      const side = l.labelSide || (vertical ? "right" : "above");
      if (l.logo) {
        const w = l.logoW || 56, h = l.logoH || 22;
        const img = document.createElementNS(NS, "image");
        img.setAttribute("href", l.logo);
        img.setAttribute("width", w);
        img.setAttribute("height", h);
        const x = side === "right" ? mx + 8 : side === "left" ? mx - 8 - w : mx - w / 2;
        const y = side === "above" ? my - h - 6 : side === "below" ? my + 6 : my - h / 2;
        img.setAttribute("x", x);
        img.setAttribute("y", y);
        svg.appendChild(img);
      }
      if (l.label) {
        const text = document.createElementNS(NS, "text");
        text.textContent = l.label;
        text.setAttribute("font-size", l.labelSize || 12);
        text.setAttribute("font-weight", "700");
        text.setAttribute("fill", l.labelColor || "#5c6b84");
        text.setAttribute("font-family", '"Hiragino Sans", "Hiragino Kaku Gothic ProN", sans-serif');
        text.setAttribute("paint-order", "stroke");
        text.setAttribute("stroke", "#fff");
        text.setAttribute("stroke-width", "4");
        text.setAttribute("stroke-linejoin", "round");
        let x = mx, y = my, anchorPos = "middle";
        if (side === "above") y = my - (l.logo ? (l.logoH || 22) + 12 : 8);
        if (side === "below") y = my + (l.logo ? (l.logoH || 22) + 24 : 18);
        if (side === "right") { x = mx + 10 + (l.logo ? (l.logoW || 56) + 6 : 0); y = my + 4; anchorPos = "start"; }
        if (side === "left") { x = mx - 10 - (l.logo ? (l.logoW || 56) + 6 : 0); y = my + 4; anchorPos = "end"; }
        text.setAttribute("x", x);
        text.setAttribute("y", y);
        text.setAttribute("text-anchor", anchorPos);
        svg.appendChild(text);
      }
    }
    window.__arrowsDone = true;
  }

  window.addEventListener("load", () => document.fonts.ready.then(draw));
})();
