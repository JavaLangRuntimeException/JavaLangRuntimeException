import { useState, type ReactNode } from "react";
import { Link } from "react-router";

// ガイドの文章の部品。色は styles.css の変数だけ

export function H2({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="mt-10 mb-3 scroll-mt-4 border-b border-line pb-1.5 text-lg font-bold text-ink first:mt-0">
      {children}
    </h2>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="my-3 max-w-[75ch] leading-7 text-ink-2">{children}</p>;
}

export function C({ children }: { children: ReactNode }) {
  return <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[13px] text-ink">{children}</code>;
}

export function UL({ children }: { children: ReactNode }) {
  return <ul className="my-3 max-w-[75ch] list-disc space-y-1.5 pl-5 leading-7 text-ink-2 marker:text-muted">{children}</ul>;
}

/** 番号付きの手順。1 つの手順に 1 つの操作 */
export function Steps({ children }: { children: ReactNode }) {
  return <ol className="my-4 max-w-[75ch] list-decimal space-y-3 pl-6 leading-7 text-ink-2 marker:font-semibold marker:text-ink">{children}</ol>;
}

/** 補足（info）と、気をつけること（warn） */
export function Note({ kind = "info", title, children }: { kind?: "info" | "warn"; title?: string; children: ReactNode }) {
  const style = kind === "warn" ? "border-warn" : "border-accent";
  return (
    <aside className={`my-4 max-w-[75ch] rounded-r border-l-4 bg-surface-2 px-4 py-3 ${style}`}>
      {title && <p className={`mb-1 font-semibold ${kind === "warn" ? "text-warn" : "text-accent"}`}>{title}</p>}
      <div className="leading-7 text-ink-2">{children}</div>
    </aside>
  );
}

/** コードの例。右上のボタンでコピーできる */
export function Code({ lang, children }: { lang: string; children: string }) {
  const [copied, setCopied] = useState(false);
  const text = children.replace(/^\n/, "").replace(/\n\s*$/, "");
  return (
    <div className="my-4 overflow-hidden rounded-lg border border-line">
      <div className="flex items-center justify-between border-b border-line bg-surface-2 px-3 py-1 text-xs text-muted">
        <span className="font-mono">{lang}</span>
        <button
          type="button"
          className="rounded px-2 py-0.5 hover:bg-surface hover:text-ink"
          onClick={() => {
            void navigator.clipboard?.writeText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? "コピーしました" : "コピー"}
        </button>
      </div>
      <pre className="overflow-x-auto bg-surface px-4 py-3 font-mono text-[13px] leading-6 text-ink">{text}</pre>
    </div>
  );
}

/** 表。1 行目が見出し */
export function Table({ rows }: { rows: ReactNode[][] }) {
  const [head, ...body] = rows;
  return (
    <div className="my-4 max-w-full overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-left text-[14px]">
        <thead className="border-b border-line bg-surface-2 text-ink-2">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {body.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className="px-3 py-2 align-top text-ink-2">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** コンソールの画面へのリンク */
export function To({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="font-medium text-accent hover:underline">
      {children}
    </Link>
  );
}

/**
 * しくみの図。リクエストがどこを通るか（左から右）と、裏で動くもの（下）
 */
export function ArchitectureDiagram() {
  const box = "fill-surface stroke-line-strong";
  const label = "fill-ink text-[12px] font-semibold";
  const sub = "fill-muted text-[10px]";
  const node = (x: number, y: number, w: number, title: string, note: string, accent = false) => (
    <g key={title}>
      <rect x={x} y={y} width={w} height="46" rx="6" className={accent ? "fill-accent-soft stroke-accent" : box} strokeWidth="1.2" />
      <text x={x + w / 2} y={y + 20} textAnchor="middle" className={label}>
        {title}
      </text>
      <text x={x + w / 2} y={y + 35} textAnchor="middle" className={sub}>
        {note}
      </text>
    </g>
  );
  const arrow = (x1: number, y1: number, x2: number, y2: number) => (
    <line key={`${x1}-${y1}-${x2}-${y2}`} x1={x1} y1={y1} x2={x2} y2={y2} className="stroke-muted" strokeWidth="1.2" markerEnd="url(#arrow)" />
  );
  return (
    <figure className="my-5 max-w-full overflow-x-auto rounded-lg border border-line bg-surface-2 p-3">
      <svg viewBox="0 0 760 250" className="min-w-[640px]" role="img" aria-label="リクエストは Cloudflare・トンネル・Envoy・API Gateway を通って関数かバケットに届く。関数はデータベースとバケットを使う">
        <defs>
          <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0 8 4 0 8Z" className="fill-muted" />
          </marker>
        </defs>
        {node(8, 20, 100, "利用者", "ブラウザ・curl")}
        {node(126, 20, 126, "Cloudflare", "DNS・証明書・キャッシュ")}
        {node(270, 20, 118, "トンネル + Envoy", "taramanji-cloud")}
        {node(406, 20, 120, "API Gateway", "cloud-gw", true)}
        {node(560, 20, 190, "関数", "0 台 ⇄ 1 台", true)}
        {node(406, 104, 120, "ストレージ", "CDN の元（読むだけ）")}
        {node(470, 188, 130, "データベース", "PostgreSQL / Redis")}
        {node(620, 188, 130, "ストレージ", "バケット（読み書き）")}
        {node(8, 188, 200, "コンソール", "cloud.taramanji.com")}
        {node(236, 188, 206, "YAML のリポジトリ → Argo CD", "taramanji-cloud-apps")}
        {arrow(108, 43, 124, 43)}
        {arrow(252, 43, 268, 43)}
        {arrow(388, 43, 404, 43)}
        {arrow(526, 43, 558, 43)}
        {arrow(466, 66, 466, 102)}
        {arrow(620, 66, 548, 186)}
        {arrow(690, 66, 685, 186)}
        {arrow(208, 211, 234, 211)}
        <text x="16" y="176" className={sub}>
          作る・変える（YAML をコミット）
        </text>
      </svg>
    </figure>
  );
}
