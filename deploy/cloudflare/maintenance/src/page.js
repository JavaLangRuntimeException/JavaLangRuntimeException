// メンテナンス中の画面（1 枚の HTML。オリジンが落ちていても出せるよう、画像やスクリプトは外から読まない）。
// 見た目は frontend と同じ語彙: 暗い面 #0e0e10・IBM Plex Sans JP / Mono・アクセントの青 1 色・
// 背景に流れる CLI コマンド・記号から定まる見出し（DecodeText）・左から伸びる線（Rule）。
// 30 秒ごとに同じ URL を見に行き、戻っていたら読み込み直す。prefers-reduced-motion では動きを止める
export const MAINTENANCE_HTML = `<!doctype html>
<html lang="ja" class="dark" style="color-scheme: dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>メンテナンス中 | taramanji.com</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+JP:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" />
<style>
  :root {
    --bg: #0e0e10; --surface: #17171a; --field: #1f1f23;
    --text: #f3f2ee; --text-2: #bdbcb6; --text-3: #9a9993;
    --border: #2a2a2e; --border-strong: #34343a;
    --accent: #3392ff; --accent-300: #8ec5ff; --prompt: #4ade80; --warn: #fbbf24;
    --sans: "IBM Plex Sans JP", system-ui, -apple-system, "Hiragino Sans", sans-serif;
    --mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; }
  body {
    background: var(--bg); color: var(--text); font-family: var(--sans);
    font-size: 15px; line-height: 1.8; letter-spacing: 0.02em;
    -webkit-font-smoothing: antialiased; overflow-x: hidden;
  }

  /* 画面上端: 行き来するアクセントの線（作業中であることを示す） */
  .progress { position: fixed; inset: 0 0 auto 0; height: 2px; overflow: hidden; z-index: 20; }
  .progress::before {
    content: ""; position: absolute; top: 0; bottom: 0; width: 35%;
    background: var(--accent); animation: sweep 1.8s cubic-bezier(.65,0,.35,1) infinite;
  }
  @keyframes sweep { from { left: -35%; } to { left: 100%; } }

  /* 背景に流れる CLI コマンド */
  .bg { position: fixed; inset: 0; z-index: 0; pointer-events: none; user-select: none; overflow: hidden; }
  .bg-cols {
    position: absolute; inset: 0; display: flex; padding-top: 80px;
    font-family: var(--mono); font-size: 10px; line-height: 1.625; opacity: 0.13;
  }
  @media (min-width: 768px) { .bg-cols { font-size: 12px; } }
  .bg-col { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: flex-end; overflow: hidden; padding: 0 12px; }
  .bg-col div { white-space: pre; overflow: hidden; text-overflow: ellipsis; }
  .bg-fade { position: absolute; inset: 0; background: linear-gradient(to bottom, transparent, rgba(14,14,16,.4), var(--bg)); }
  .p { color: var(--prompt); }

  main {
    position: relative; z-index: 1; min-height: 100vh; min-height: 100dvh;
    display: flex; align-items: center; padding: 72px 16px 48px;
  }
  .wrap { width: 100%; max-width: 640px; margin: 0 auto; }

  .meta { font-family: var(--mono); font-size: 13px; color: var(--text-3); letter-spacing: 0.04em; margin: 0 0 12px; }
  .reveal { animation: reveal .7s cubic-bezier(.2,.7,.2,1) both; }
  .d1 { animation-delay: .15s; } .d2 { animation-delay: .35s; } .d3 { animation-delay: .55s; } .d4 { animation-delay: .75s; }
  @keyframes reveal { from { opacity: 0; filter: blur(6px); translate: 0 8px; } to { opacity: 1; filter: none; translate: 0 0; } }

  h1 {
    margin: 0; font-size: clamp(26px, 6vw, 36px); line-height: 1.35; font-weight: 600;
    letter-spacing: 0.01em; font-feature-settings: "palt";
  }
  h1 .scramble { color: var(--text-3); font-family: var(--mono); }

  .rule { position: relative; height: 1px; margin: 24px 0; background: var(--border); transform-origin: left; animation: grow 1s .2s cubic-bezier(.2,.7,.2,1) both; }
  .rule::before { content: ""; position: absolute; left: 0; top: 0; height: 1px; width: 64px; background: var(--accent); }
  @keyframes grow { from { scale: 0 1; } to { scale: 1 1; } }

  .lead { margin: 0; }
  .en { margin: 8px 0 0; color: var(--text-2); font-size: 14px; }

  .term {
    margin-top: 32px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
    font-family: var(--mono); font-size: 13px; line-height: 1.7; overflow: hidden;
  }
  .term-head {
    display: flex; justify-content: space-between; gap: 12px; padding: 10px 16px;
    border-bottom: 1px solid var(--border); color: var(--text-3);
  }
  .term-body { padding: 14px 16px 16px; min-height: 196px; color: var(--text-2); }
  .term-body div { white-space: pre-wrap; word-break: break-all; }
  .term-body .cmd { color: var(--text); }
  .term-body .warn { color: var(--warn); }
  .term-body .ok { color: var(--prompt); }
  .cursor { display: inline-block; width: 7px; height: 14px; margin-left: 2px; vertical-align: -2px; background: var(--text-2); animation: blink 1s steps(1) infinite; }
  @keyframes blink { 50% { opacity: 0; } }

  dl.status { display: grid; grid-template-columns: auto 1fr; gap: 6px 24px; margin: 24px 0 0; font-size: 14px; }
  dl.status dt { color: var(--text-3); font-family: var(--mono); font-size: 13px; padding-top: 1px; }
  dl.status dd { margin: 0; display: flex; align-items: center; gap: 8px; }
  .spinner {
    width: 12px; height: 12px; border-radius: 50%; flex: none;
    border: 2px solid var(--border-strong); border-top-color: var(--accent-300);
    animation: spin .9s linear infinite;
  }
  @keyframes spin { to { rotate: 360deg; } }
  .mono { font-family: var(--mono); font-size: 13px; color: var(--text-2); }
  .accent { color: var(--accent-300); }

  button.retry {
    margin-top: 28px; font: inherit; font-size: 14px; font-weight: 500; color: var(--text);
    background: var(--field); border: 1px solid var(--border-strong); border-radius: 8px;
    padding: 8px 16px; cursor: pointer; transition: border-color .15s, scale .12s;
  }
  button.retry:hover { border-color: #55555c; }
  button.retry:active { scale: 0.97; }
  button.retry:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

  @media (prefers-reduced-motion: reduce) {
    .bg, .progress::before { display: none; }
    .reveal, .rule, .cursor, .spinner { animation: none; }
  }
</style>
</head>
<body>
<div class="progress" aria-hidden="true"></div>
<div class="bg" aria-hidden="true"><div class="bg-cols" id="bg"></div><div class="bg-fade"></div></div>

<main>
  <div class="wrap">
    <p class="meta reveal">503 · maintenance</p>
    <h1 id="title" data-text="ただいまメンテナンス中です">ただいまメンテナンス中です</h1>
    <div class="rule" aria-hidden="true"></div>
    <p class="lead reveal d1">サーバーを点検しています。しばらくしてから、もう一度お越しください。</p>
    <p class="en reveal d1" lang="en">taramanji.com is under maintenance. Please check back shortly.</p>

    <div class="term reveal d2" aria-hidden="true">
      <div class="term-head"><span>taramanji@mac-mini: ~</span><span>zsh</span></div>
      <div class="term-body" id="term"></div>
    </div>

    <dl class="status reveal d3" aria-live="polite">
      <dt>状態</dt>
      <dd id="state"><span class="spinner" aria-hidden="true"></span><span>復旧を待っています</span></dd>
      <dt>次の確認</dt>
      <dd class="mono" id="next">30 秒後</dd>
      <dt>最終確認</dt>
      <dd class="mono" id="last">--:--:--</dd>
    </dl>

    <button type="button" class="retry reveal d4" id="retry">今すぐ確かめる</button>
  </div>
</main>

<script>
(function () {
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* 見出し: 記号から 1 文字ずつ定まる（DecodeText と同じ動き） */
  var SYMBOLS = "!<>-_/[]{}=+*^?#$%&01";
  var title = document.getElementById("title");
  var text = title.getAttribute("data-text");
  if (!reduced) {
    var frame = 0, total = text.length * 3 + 12;
    title.setAttribute("aria-label", text);
    (function tick() {
      var html = "";
      for (var i = 0; i < text.length; i++) {
        var settle = i * 3 + 8;
        if (frame >= settle) html += text[i];
        else if (frame >= i * 2) html += '<span class="scramble">' + SYMBOLS[(Math.random() * SYMBOLS.length) | 0] + "</span>";
        else html += '<span style="opacity:0">' + text[i] + "</span>";
      }
      title.innerHTML = html;
      if (frame++ < total) setTimeout(tick, 32); else title.textContent = text;
    })();
  }

  /* ターミナル: 落ちたところから戻すまでの作業を打ち込む */
  var SCRIPT = [
    ["cmd", "$ curl -sI https://taramanji.com | head -1"],
    ["warn", "HTTP/2 503"],
    ["cmd", "$ kubectl get nodes"],
    ["", "NAME                      STATUS     AGE"],
    ["warn", "taramanji-control-plane   NotReady   41d"],
    ["cmd", "$ kubectl rollout restart deploy -n taramanji"],
    ["", "deployment.apps/web restarted"],
    ["cmd", "$ kubectl rollout status deploy/web -n taramanji"],
    ["", "Waiting for deployment \\"web\\" rollout to finish: 0 of 1 updated replicas are available..."]
  ];
  var term = document.getElementById("term");
  function line(cls, s) { var d = document.createElement("div"); if (cls) d.className = cls; d.textContent = s; term.appendChild(d); return d; }
  function cursor(el) { var c = document.createElement("span"); c.className = "cursor"; el.appendChild(c); }
  if (reduced) {
    SCRIPT.forEach(function (l) { line(l[0], l[1]); });
    cursor(term.lastChild);
  } else {
    var li = 0;
    (function nextLine() {
      if (li >= SCRIPT.length) { cursor(term.lastChild); return; }
      var l = SCRIPT[li++], el = line(l[0], "");
      if (l[0] !== "cmd") { el.textContent = l[1]; setTimeout(nextLine, 220); return; }
      var ci = 0;
      (function type() {
        el.textContent = l[1].slice(0, ++ci);
        if (ci < l[1].length) setTimeout(type, 28 + Math.random() * 40);
        else setTimeout(nextLine, 420);
      })();
    })();
  }

  /* 背景のコマンド（frontend の TerminalBackground と同じ種類） */
  var BG = [
    ["git clone https://github.com/taramanji/portfolio.git", ["Cloning into 'portfolio'...", "remote: Enumerating objects: 1247, done.", "Receiving objects: 100% (1247/1247), 4.82 MiB | 12.3 MiB/s, done."]],
    ["cd portfolio && npm install", ["added 1432 packages in 28s", "182 packages are looking for funding"]],
    ["docker compose up -d", ["[+] Running 3/3", " ✓ Container postgres    Started  0.8s", " ✓ Container redis       Started  0.6s", " ✓ Container app         Started  1.2s"]],
    ["go build -o server ./cmd/api", ["compiling packages...", "linking...", "build complete: ./server"]],
    ["kubectl get pods -n taramanji", ["NAME                     READY   STATUS             RESTARTS", "web-7f9c6d8b5-x2k4p      0/1     CrashLoopBackOff   4", "identity-5d8f7c9b-q8r2m  0/1     Pending            0"]],
    ["kubectl describe node taramanji-control-plane", ["Conditions:", "  Ready   False   KubeletNotReady", "  MemoryPressure   True"]],
    ["argocd app sync taramanji-prod", ["Operation:  Sync", "Phase:      Running", "Message:    waiting for healthy state"]],
    ["cloudflared tunnel info taramanji", ["NAME: taramanji", "CONNECTOR ID   EDGE", "(no active connections)"]],
    ["kubectl argo rollouts get rollout web", ["Status:  ◌ Progressing", "Strategy: Canary", "  Step:  0/8"]],
    ["ssh mac-mini.tailnet 'orb restart'", ["Restarting OrbStack...", "done"]]
  ];
  if (!reduced) {
    var bg = document.getElementById("bg"), cols = window.innerWidth < 640 ? 2 : 3;
    for (var c = 0; c < cols; c++) (function (ci) {
      var col = document.createElement("div"); col.className = "bg-col"; bg.appendChild(col);
      var idx = Math.floor(BG.length / cols * ci);
      function add(html) { var d = document.createElement("div"); d.innerHTML = html; col.appendChild(d); while (col.childNodes.length > 80) col.removeChild(col.firstChild); return d; }
      function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
      (function run() {
        var e = BG[idx++ % BG.length], d = add('<span class="p">$</span> '), i = 0;
        (function type() {
          d.innerHTML = '<span class="p">$</span> ' + esc(e[0].slice(0, ++i));
          if (i < e[0].length) return setTimeout(type, 12);
          var o = 0;
          setTimeout(function out() {
            if (o < e[1].length) { add(esc(e[1][o++])); return setTimeout(out, 45); }
            add("&nbsp;"); setTimeout(run, 260);
          }, 70);
        })();
      })();
    })(c);
  }

  /* 30 秒ごとに見に行き、戻っていたら読み込み直す */
  var INTERVAL = 30, left = INTERVAL, checking = false;
  var nextEl = document.getElementById("next"), lastEl = document.getElementById("last"), stateEl = document.getElementById("state");
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function check() {
    if (checking) return;
    checking = true; nextEl.textContent = "確かめています…";
    fetch(location.href, { cache: "no-store", credentials: "same-origin", headers: { "Accept": "text/plain" } })
      .then(function (r) { return r.status < 500 && !r.headers.get("X-Taramanji-Maintenance"); })
      .catch(function () { return false; })
      .then(function (up) {
        var t = new Date();
        lastEl.textContent = pad(t.getHours()) + ":" + pad(t.getMinutes()) + ":" + pad(t.getSeconds());
        checking = false;
        if (up) {
          stateEl.innerHTML = '<span class="ok accent">戻りました。ページを読み込み直します</span>';
          nextEl.textContent = "—";
          setTimeout(function () { location.reload(); }, 800);
          return;
        }
        left = INTERVAL; nextEl.textContent = left + " 秒後";
      });
  }
  setInterval(function () {
    if (checking || document.hidden) return;
    if (--left <= 0) check(); else nextEl.textContent = left + " 秒後";
  }, 1000);
  document.getElementById("retry").addEventListener("click", check);
})();
</script>
</body>
</html>
`;
