import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { useMetrics, useOverview, type MetricsRange } from "@/api/console";
import type { Series } from "@/api/gen/taramanji/cloud/v1/console_pb";
import { LineChart, Legend } from "@/components/LineChart";
import { EmptyState, PageHeader, Panel, Skeleton } from "@/components/Page";
import { QueryError } from "@/components/QueryError";
import { formatDateTime, formatValue } from "@/lib/format";
import { buildChartData, metricDefs, summarize, type MetricDef } from "@/lib/metrics";

const ranges: { value: MetricsRange; label: string }[] = [
  { value: "1h", label: "1時間" },
  { value: "1d", label: "1日" },
  { value: "7d", label: "7日" },
];

function toRange(v: string | null): MetricsRange {
  return v === "1d" || v === "7d" ? v : "1h";
}

export function MetricsPage() {
  const overview = useOverview();
  const [params, setParams] = useSearchParams();
  const range = toRange(params.get("range"));
  const enabled = overview.data?.metricsEnabled === true;
  const metrics = useMetrics(range, enabled);

  const selector = (
    <div role="group" aria-label="表示する期間" className="inline-flex rounded-md border border-line-strong bg-surface p-0.5">
      {ranges.map((r) => (
        <button
          key={r.value}
          type="button"
          aria-pressed={r.value === range}
          onClick={() => setParams(r.value === "1h" ? {} : { range: r.value }, { replace: true })}
          className={`rounded px-3 py-1 text-[13px] ${
            r.value === range ? "bg-accent-soft font-medium text-accent" : "text-ink-2 hover:text-ink"
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );

  const header = (
    <PageHeader
      title="メトリクス"
      description="リクエストと資源の使い方です。時刻は日本時間。"
      actions={enabled ? selector : undefined}
    />
  );

  if (overview.isError) {
    return (
      <>
        {header}
        <QueryError error={overview.error} onRetry={() => overview.refetch()} />
      </>
    );
  }
  if (overview.isPending) {
    return (
      <>
        {header}
        <ChartGridSkeleton />
      </>
    );
  }
  if (!enabled) {
    return (
      <>
        {header}
        <Panel>
          <EmptyState title="dev / stg ではメトリクスを集めていません">
            メトリクスは本番（cloud.taramanji.com）だけで集めています。リクエスト数や CPU・メモリを見るときは本番のコンソールを開いてください。
          </EmptyState>
        </Panel>
      </>
    );
  }

  return (
    <>
      {header}
      {metrics.isError ? (
        <QueryError error={metrics.error} onRetry={() => metrics.refetch()} />
      ) : metrics.data ? (
        <>
          <p className="mb-3 text-[13px] text-muted" aria-live="polite">
            {metrics.isFetching ? "更新しています…" : `${formatDateTime(metrics.dataUpdatedAt)} 時点。1 分ごとに更新します。`}
          </p>
          <MetricGrid series={metrics.data.series} range={range} />
        </>
      ) : (
        <ChartGridSkeleton />
      )}
    </>
  );
}

function MetricGrid({ series, range }: { series: Series[]; range: MetricsRange }) {
  // 決まった順に並べ、知らない metric は後ろに id のまま出す
  const defs = useMemo(() => {
    const known = new Set(metricDefs.map((d) => d.id));
    const extra = [...new Set(series.map((s) => s.metric))]
      .filter((id) => !known.has(id))
      .map<MetricDef>((id) => ({ id, title: id, unit: series.find((s) => s.metric === id)?.unit ?? "", description: "", additive: false }));
    return [...metricDefs, ...extra];
  }, [series]);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {defs.map((def) => (
        <MetricCard key={def.id} def={def} raw={series.filter((s) => s.metric === def.id)} range={range} />
      ))}
    </div>
  );
}

function MetricCard({ def, raw, range }: { def: MetricDef; raw: Series[]; range: MetricsRange }) {
  const unit = raw[0]?.unit || def.unit;
  const { series, omitted } = useMemo(() => buildChartData(raw, def.additive), [raw, def.additive]);

  return (
    <Panel title={def.title} aside={def.description}>
      {series.length === 0 ? (
        <EmptyState title="データがまだありません">この期間に記録された値がありません。期間を長くすると出ることがあります。</EmptyState>
      ) : (
        <div className="space-y-3 px-4 py-3">
          <Legend series={series} />
          <LineChart series={series} unit={unit} range={range} label={def.title} />
          {omitted > 0 && <p className="text-[13px] text-muted">値の小さいほか {omitted} 系列は省いています（表には出ません）。</p>}
          <details className="group text-[13px]">
            <summary className="cursor-pointer text-ink-2 select-none hover:text-ink">表で見る</summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left">
                <thead className="text-muted">
                  <tr>
                    <th scope="col" className="py-1 pr-4 font-medium">
                      系列
                    </th>
                    <th scope="col" className="py-1 pr-4 text-right font-medium">
                      最新
                    </th>
                    <th scope="col" className="py-1 pr-4 text-right font-medium">
                      平均
                    </th>
                    <th scope="col" className="py-1 text-right font-medium">
                      最大
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {series.map((s) => {
                    const sum = summarize(s.points);
                    return (
                      <tr key={s.key} className="border-t border-line">
                        <th scope="row" className="py-1 pr-4 font-normal break-all text-ink">
                          {s.label}
                        </th>
                        <td className="py-1 pr-4 text-right whitespace-nowrap">{formatValue(sum.last, unit)}</td>
                        <td className="py-1 pr-4 text-right whitespace-nowrap">{formatValue(sum.mean, unit)}</td>
                        <td className="py-1 text-right whitespace-nowrap">{formatValue(sum.max, unit)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}
    </Panel>
  );
}

function ChartGridSkeleton() {
  return (
    <div className="grid gap-4 xl:grid-cols-2" aria-busy="true" aria-label="読み込み中">
      {metricDefs.map((d) => (
        <Panel key={d.id} title={d.title}>
          <div className="px-4 py-3">
            <Skeleton className="h-[184px] w-full" />
          </div>
        </Panel>
      ))}
    </div>
  );
}
