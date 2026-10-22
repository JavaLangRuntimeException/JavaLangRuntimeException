import { useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { formatDateTime, formatTick, formatTimeTick, formatValue } from "@/lib/format";
import type { ChartSeries } from "@/lib/metrics";
import { linePath, linear, nearestIndex, timeTicks, yScale } from "@/lib/scale";

const HEIGHT = 184;
const M = { top: 10, right: 12, bottom: 24, left: 68 };
const RANGE_MS: Record<string, number> = { "1h": 3_600_000, "1d": 86_400_000, "7d": 604_800_000 };

/** 要素の幅を追う（グラフは幅に合わせて描き直す） */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * 折れ線グラフ（ライブラリを使わず SVG で描く）。
 * y は 0 始まりの 1 本の軸、x は日本時間。ポインターか ← → キーで縦線を動かすと、その時刻の全系列の値を出す
 */
export function LineChart({ series, unit, range, label }: { series: ChartSeries[]; unit: string; range: string; label: string }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const tipId = useId();

  const model = useMemo(() => {
    const times = [...new Set(series.flatMap((s) => s.points.map((p) => p.t)))].sort((a, b) => a - b);
    const end = times.length ? times[times.length - 1] : Date.now();
    const start = end - (RANGE_MS[range] ?? RANGE_MS["1h"]);
    const dataMax = Math.max(...series.flatMap((s) => s.points.map((p) => p.v)).filter(Number.isFinite));
    const ys = yScale(dataMax, unit);
    return { times: times.filter((t) => t >= start), start, end, ys };
  }, [series, unit, range]);

  const plotW = Math.max(0, width - M.left - M.right);
  const plotH = HEIGHT - M.top - M.bottom;
  const x = linear([model.start, model.end], [M.left, M.left + plotW]);
  const y = linear([0, model.ys.max], [M.top + plotH, M.top]);

  // 目盛りのラベルが重ならないように、狭いときは間引く
  const allTicks = timeTicks(model.start, model.end, range);
  const every = Math.max(1, Math.ceil((allTicks.length * 52) / Math.max(plotW, 1)));
  const xTicks = allTicks.filter((_, i) => i % every === 0);

  const hoverT = hover != null ? model.times[hover] : undefined;
  const readout =
    hoverT != null
      ? series
          .map((s) => {
            const i = nearestIndex(
              s.points.map((p) => p.t),
              hoverT,
            );
            const p = i >= 0 ? s.points[i] : undefined;
            return { s, v: p && p.t === hoverT ? p.v : Number.NaN };
          })
          .sort((a, b) => (Number.isFinite(b.v) ? b.v : -Infinity) - (Number.isFinite(a.v) ? a.v : -Infinity))
      : [];

  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    if (px < M.left - 4 || px > M.left + plotW + 4 || model.times.length === 0) return setHover(null);
    const t = model.start + ((px - M.left) / (plotW || 1)) * (model.end - model.start);
    setHover(nearestIndex(model.times, t));
  }

  function onKeyDown(e: KeyboardEvent<SVGSVGElement>) {
    const n = model.times.length;
    if (n === 0) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const d = e.key === "ArrowLeft" ? -1 : 1;
      setHover((h) => Math.min(n - 1, Math.max(0, (h ?? (d > 0 ? -1 : n)) + d)));
    } else if (e.key === "Escape") {
      setHover(null);
    }
  }

  const hx = hoverT != null ? x(hoverT) : 0;
  // ツールチップは縦線の広い側に出し、カードからはみ出さない幅にする
  const tipLeft = hx > width / 2;
  const tipMax = Math.max(140, (tipLeft ? hx : width - hx) - 16);

  return (
    <div ref={ref} className="relative">
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`${label}の折れ線グラフ。← → キーで時刻を選ぶと値が出ます`}
          aria-describedby={hoverT != null ? tipId : undefined}
          tabIndex={0}
          className="block touch-pan-y"
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHover(null)}
          onKeyDown={onKeyDown}
          onBlur={() => setHover(null)}
        >
          {/* y の目盛りと横の補助線（細く、控えめに） */}
          {model.ys.ticks.map((t) => (
            <g key={t}>
              <line
                x1={M.left}
                x2={M.left + plotW}
                y1={y(t)}
                y2={y(t)}
                stroke={t === 0 ? "var(--axis)" : "var(--grid)"}
                strokeWidth={1}
                shapeRendering="crispEdges"
              />
              <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--muted)" className="tabular-nums">
                {formatTick(t, unit, model.ys.max)}
              </text>
            </g>
          ))}
          {/* x の目盛り（日本時間） */}
          {xTicks.map((t) => (
            <text key={t} x={x(t)} y={HEIGHT - 6} textAnchor="middle" fontSize={11} fill="var(--muted)" className="tabular-nums">
              {formatTimeTick(t, range)}
            </text>
          ))}
          {series.map((s) => (
            <path
              key={s.key}
              d={linePath(s.points, x, y)}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {hoverT != null && (
            <g pointerEvents="none">
              <line x1={hx} x2={hx} y1={M.top} y2={M.top + plotH} stroke="var(--line-strong)" strokeWidth={1} />
              {readout
                .filter((r) => Number.isFinite(r.v))
                .map((r) => (
                  <circle key={r.s.key} cx={hx} cy={y(r.v)} r={4} fill={r.s.color} stroke="var(--surface)" strokeWidth={2} />
                ))}
            </g>
          )}
        </svg>
      )}
      {width === 0 && <div style={{ height: HEIGHT }} />}

      {hoverT != null && (
        <div
          id={tipId}
          role="status"
          className="pointer-events-none absolute top-1 z-10 rounded border border-line bg-surface px-3 py-2 text-[13px] shadow-sm"
          style={{ maxWidth: tipMax, ...(tipLeft ? { right: width - hx + 12 } : { left: hx + 12 }) }}
        >
          <p className="mb-1 text-muted tabular-nums">{formatDateTime(hoverT)}</p>
          <ul className="space-y-0.5">
            {readout.map((r) => (
              <li key={r.s.key} className="flex min-w-0 items-center gap-2 whitespace-nowrap">
                <LineKey color={r.s.color} />
                <span className="shrink-0 font-semibold text-ink tabular-nums">{formatValue(r.v, unit)}</span>
                {series.length > 1 && <span className="min-w-0 truncate text-ink-2">{r.s.label}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** 凡例。線の色の短い線と名前（色だけに頼らない） */
export function Legend({ series }: { series: ChartSeries[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-2">
      {series.map((s) => (
        <li key={s.key} className="flex min-w-0 items-center gap-1.5">
          <LineKey color={s.color} />
          <span className="truncate">{s.label}</span>
        </li>
      ))}
    </ul>
  );
}

/** 系列の印。塗りの箱ではなく、線と同じ太さの短い線（小数のピクセルでも細くならないよう SVG で描く） */
function LineKey({ color }: { color: string }) {
  return (
    <svg aria-hidden width={14} height={6} className="shrink-0">
      <line x1={1} x2={13} y1={3} y2={3} stroke={color} strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}
