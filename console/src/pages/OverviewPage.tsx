import { Link } from "react-router";
import { useCapacity, useOverview } from "@/api/console";
import { EnvBadge } from "@/components/EnvBadge";
import { Mono, PageHeader, Panel, Skeleton } from "@/components/Page";
import { QueryError } from "@/components/QueryError";
import { StatusDot, statusOf } from "@/components/StatusDot";
import { UsageBar } from "@/components/UsageBar";
import { formatPercent, levelOf, limitedByLabel, pickFit, sizeLabel, usage } from "@/lib/capacity";
import { toEnv } from "@/lib/env";
import { formatBytes } from "@/lib/format";

const envDescription = { prod: "本番", stg: "ステージング", dev: "開発" } as const;

export function OverviewPage() {
  const overview = useOverview();

  if (overview.isError) {
    return (
      <>
        <PageHeader title="概要" />
        <QueryError error={overview.error} onRetry={() => overview.refetch()} />
      </>
    );
  }

  const data = overview.data;
  const env = toEnv(data?.environment);

  return (
    <>
      <PageHeader title="概要" description="このコンソールが動いている環境と、部品の状態です。" />

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="環境" className="lg:col-span-1">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 px-4 py-3">
            <dt className="text-muted">環境</dt>
            <dd className="flex items-center gap-2">
              {data ? (
                <>
                  {env && <EnvBadge env={env} />}
                  <span>{env ? envDescription[env] : data.environment}</span>
                </>
              ) : (
                <Skeleton className="h-5 w-24" />
              )}
            </dd>
            <dt className="text-muted">ログイン中</dt>
            <dd className="min-w-0 truncate">{data ? data.email : <Skeleton className="h-5 w-40" />}</dd>
            <dt className="text-muted">メトリクス</dt>
            <dd>{data ? (data.metricsEnabled ? "収集しています" : "収集していません") : <Skeleton className="h-5 w-24" />}</dd>
          </dl>
          {data?.metricsEnabled && (
            <div className="border-t border-line px-4 py-3">
              <Link to="/metrics" className="font-medium text-accent hover:underline">
                リクエスト数・エラー率・CPU・メモリを見る
              </Link>
            </div>
          )}
        </Panel>

        <CapacityCard />

        <Panel title="URL の形" className="lg:col-span-1">
          <dl className="grid gap-x-6 gap-y-2 px-4 py-3 sm:grid-cols-[auto_1fr] lg:grid-cols-1">
            <dt className="text-muted">バケット</dt>
            <dd className="min-w-0 break-all">
              {data ? <Mono>https://&lt;名前&gt;{data.storageHostSuffix}</Mono> : <Skeleton className="h-5 w-64" />}
            </dd>
            <dt className="text-muted">アプリ</dt>
            <dd className="min-w-0 break-all">
              {data ? <Mono>https://&lt;名前&gt;{data.hostingHostSuffix}</Mono> : <Skeleton className="h-5 w-64" />}
            </dd>
          </dl>
          <p className="border-t border-line px-4 py-2.5 text-[13px] text-muted">
            バケットやアプリを作ると、その名前でこの形の URL が割り当てられます。
          </p>
        </Panel>
      </div>

      <Panel title="部品" aside={data && `${data.components.length} 件`} className="mt-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-surface-2 text-[13px] text-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  名前
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  状態
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  動作数 / 希望数
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  版
                </th>
              </tr>
            </thead>
            <tbody>
              {data
                ? data.components.map((c) => (
                    <tr key={c.name} className="border-t border-line">
                      <th scope="row" className="px-4 py-2 font-medium text-ink">
                        {c.name}
                      </th>
                      <td className="px-4 py-2">
                        <StatusDot status={statusOf(c.ready, c.desired)} />
                      </td>
                      <td className="px-4 py-2 text-right">
                        {c.ready} / {c.desired}
                      </td>
                      <td className="px-4 py-2">
                        <Mono>{c.version || "—"}</Mono>
                      </td>
                    </tr>
                  ))
                : [0, 1, 2].map((i) => (
                    <tr key={i} className="border-t border-line">
                      <td colSpan={4} className="px-4 py-2.5">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    </tr>
                  ))}
              {data && data.components.length === 0 && (
                <tr className="border-t border-line">
                  <td colSpan={4} className="px-4 py-6 text-center text-ink-2">
                    部品の情報を取れませんでした。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

/** 容量の要約。デプロイの前に「まだ置けるか」だけ見られるように、M サイズの残りとこの環境のメモリ枠を出す */
function CapacityCard() {
  const capacity = useCapacity();
  const data = capacity.data;
  const fit = data && pickFit(data.fits);
  const mem = usage(data?.quota?.memory);

  return (
    <Panel title="容量" className="lg:col-span-1">
      <div className="px-4 py-3">
        {capacity.isError && !data ? (
          <p className="text-ink-2">容量を取れませんでした。</p>
        ) : !data ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-full" />
          </div>
        ) : (
          <>
            {fit ? (
              <>
                <p className={`flex items-baseline gap-1 ${fit.count <= 0 ? "text-warn" : "text-ink"}`}>
                  <span className="text-ink-2">あと {sizeLabel(fit.name)} サイズで</span>
                  <span className="text-2xl leading-none font-semibold tabular-nums">{fit.count}</span>
                  <span className="text-ink-2">個</span>
                </p>
                <p className="mt-1 text-xs text-muted">上限: {limitedByLabel(fit.limitedBy)}</p>
              </>
            ) : (
              <p className="text-ink-2">大きさの一覧を取れませんでした。</p>
            )}
            <div className="mt-3 mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-[13px]">
              <span className="text-ink-2">この環境のメモリ枠</span>
              <span className="text-ink-2 tabular-nums">
                {mem.unlimited ? "枠なし" : `${formatBytes(mem.used)} / ${formatBytes(mem.limit)}（${formatPercent(mem.percent)}）`}
              </span>
            </div>
            <UsageBar fill={mem.fill} level={levelOf(mem)} size="sm" />
          </>
        )}
      </div>
      <div className="border-t border-line px-4 py-3">
        <Link to="/capacity" className="font-medium text-accent hover:underline">
          容量の内訳を見る
        </Link>
      </div>
    </Panel>
  );
}
