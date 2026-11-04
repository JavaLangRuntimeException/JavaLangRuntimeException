import { useCapacity } from "@/api/console";
import type { GetCapacityResponse, PodUsage, SizeFit } from "@/api/gen/taramanji/cloud/v1/console_pb";
import { EmptyState, Mono, PageHeader, Panel, Skeleton } from "@/components/Page";
import { QueryError } from "@/components/QueryError";
import { MachineKey, MachineMemoryBar, UsageBar } from "@/components/UsageBar";
import {
  formatCpu,
  formatPercent,
  levelOf,
  limitedByLabel,
  machineMemory,
  num,
  sizeLabel,
  usage,
  type Usage,
} from "@/lib/capacity";
import { formatBytes, formatDateTime } from "@/lib/format";

const header = (
  <PageHeader title="容量" description="この環境にあとどのくらいアプリを置けるかと、Mac mini 全体の空きです。" />
);

export function CapacityPage() {
  const capacity = useCapacity();

  if (capacity.isError && !capacity.data) {
    return (
      <>
        {header}
        <QueryError error={capacity.error} onRetry={() => capacity.refetch()} />
      </>
    );
  }

  const data = capacity.data;
  return (
    <>
      {header}
      <p className="mb-3 text-[13px] text-muted" aria-live="polite">
        {!data
          ? "読み込んでいます…"
          : capacity.isFetching
            ? "更新しています…"
            : `${formatDateTime(capacity.dataUpdatedAt)} 時点。30 秒ごとに更新します。`}
      </p>
      {data ? <CapacityView data={data} /> : <CapacitySkeleton />}
    </>
  );
}

function CapacityView({ data }: { data: GetCapacityResponse }) {
  const mem = machineMemory(data.machine);
  return (
    <div className="space-y-4">
      {/* 予約を割り込んでいるときは、どの大きさも 0 個になる。その理由がすぐわかるよう、いちばん上に出す */}
      {mem.over && <OverWarning shortage={mem.shortage} />}
      <Fits fits={data.fits} />
      <div className="grid gap-4 lg:grid-cols-2">
        <QuotaPanel data={data} />
        <MachinePanel data={data} />
      </div>
      <PodsPanel pods={data.pods} />
    </div>
  );
}

// ---- あと置けるアプリ ----

function Fits({ fits }: { fits: SizeFit[] }) {
  return (
    <Panel title="あと置けるアプリ" aside="1 つあたりのメモリ / CPU">
      {fits.length === 0 ? (
        <EmptyState title="大きさの一覧を取れませんでした">少し待ってから読み直してください。</EmptyState>
      ) : (
        // スマホでは 2 列、広いと 4 列。大きさの順は API の並び（s → xl）のまま
        <ul className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4">
          {fits.map((f) => (
            <FitItem key={f.name} fit={f} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function FitItem({ fit }: { fit: SizeFit }) {
  const none = fit.count <= 0;
  return (
    <li className="min-w-0 bg-surface px-4 py-3">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-semibold text-ink">{sizeLabel(fit.name)}</span>
        <span className="text-[13px] text-muted">
          {formatBytes(num(fit.memory))} / {formatCpu(num(fit.cpuMillis))}
        </span>
      </p>
      <p className={`mt-1 flex items-baseline gap-1 ${none ? "text-warn" : "text-ink"}`}>
        <span className="text-xs text-ink-2">あと</span>
        <span className="text-3xl leading-none font-semibold tabular-nums">{fit.count}</span>
        <span className="text-xs text-ink-2">個</span>
        {none && <span className="ml-1 text-xs font-medium">いまは置けません</span>}
      </p>
      <p className="mt-1.5 text-xs text-muted">上限: {limitedByLabel(fit.limitedBy)}</p>
    </li>
  );
}

// ---- この環境の枠 ----

type Row = { label: string; u: Usage; format: (v: number) => string };

function QuotaPanel({ data }: { data: GetCapacityResponse }) {
  const q = data.quota;
  const rows: Row[] = [
    { label: "メモリ", u: usage(q?.memory), format: formatBytes },
    { label: "CPU", u: usage(q?.cpu), format: formatCpu },
    { label: "Pod 数", u: usage(q?.pods), format: (v) => `${v.toLocaleString("en-US")} 個` },
    { label: "ディスク", u: usage(q?.volumeStorage), format: formatBytes },
  ];
  return (
    <Panel title="この環境の枠" aside={q?.namespace ? <Mono>{q.namespace}</Mono> : undefined}>
      <p className="px-4 pt-3 text-[13px] text-ink-2">
        この環境のアプリが予約できる合計です。メモリは予約した分をそのまま使うので、置いた時点で枠を使います。
      </p>
      <ul className="space-y-3 px-4 py-3">
        {rows.map((r) => (
          <QuotaRow key={r.label} row={r} />
        ))}
      </ul>
      <p className="border-t border-line px-4 py-2.5 text-[13px] text-muted">
        ストレージ（バケット）の容量は、ストレージ機能を追加したときにここに出します。
      </p>
    </Panel>
  );
}

function QuotaRow({ row: { label, u, format } }: { row: Row }) {
  const level = levelOf(u);
  return (
    <li>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-medium text-ink">{label}</span>
        <span className="text-[13px] text-ink-2 tabular-nums">
          {u.unlimited ? (
            <>
              {format(u.used)} 使用・<span className="text-muted">枠なし</span>
            </>
          ) : (
            <>
              {format(u.used)} / {format(u.limit)}
              <span className={`ml-2 font-medium ${level === "ok" ? "text-ink" : level === "warn" ? "text-warn" : "text-bad"}`}>
                {formatPercent(u.percent)}
              </span>
            </>
          )}
        </span>
      </div>
      <UsageBar fill={u.fill} level={level} />
    </li>
  );
}

// ---- Mac mini 全体 ----

function MachinePanel({ data }: { data: GetCapacityResponse }) {
  const m = machineMemory(data.machine);
  const cpu = usage({ used: num(data.machine?.cpuUsedMillis), limit: num(data.machine?.cpuTotalMillis) });
  const legend = [
    { kind: "used", label: "使用中", value: m.used },
    { kind: "reserved", label: "予約（taramanji.com・gws の余裕）", value: m.reserved },
    { kind: "free", label: "空き", value: m.free },
  ] as const;

  return (
    <Panel title="Mac mini 全体" aside={m.total > 0 ? `メモリ ${formatBytes(m.total)}` : undefined}>
      <p className="px-4 pt-3 text-[13px] text-ink-2">
        taramanji.com・gws と同じマシンを分け合っています。予約の分はアプリには渡しません。
      </p>
      <div className="px-4 py-3">
        <p className="mb-1 font-medium text-ink">メモリ</p>
        <MachineMemoryBar m={m} />
        <dl className="mt-2 space-y-1 text-[13px]">
          {legend.map((l) => (
            <div key={l.kind} className="flex items-center gap-2">
              <MachineKey kind={l.kind} over={m.over} />
              <dt className="min-w-0 text-ink-2">{l.label}</dt>
              <dd className="ml-auto shrink-0 text-ink tabular-nums">{formatBytes(l.value)}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="border-t border-line px-4 py-3">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="font-medium text-ink">CPU</span>
          <span className="text-[13px] text-ink-2 tabular-nums">
            {cpu.unlimited ? (
              <span className="text-muted">取得できませんでした</span>
            ) : (
              <>
                {formatCpu(cpu.used)} / {formatCpu(cpu.limit)} 使用中
                <span className="ml-2 font-medium text-ink">{formatPercent(cpu.percent)}</span>
              </>
            )}
          </span>
        </div>
        <UsageBar fill={cpu.fill} level={levelOf(cpu)} size="sm" />
      </div>
    </Panel>
  );
}

function OverWarning({ shortage }: { shortage: number }) {
  return (
    <div role="alert" className="rounded-md border border-bad bg-surface px-4 py-3">
      <p className="font-semibold text-bad">Mac mini のメモリが予約の分まで使われています</p>
      <p className="mt-1 text-ink-2">
        使用中と予約を合わせると全体を {formatBytes(shortage)} 超えています。taramanji.com・gws を守るため、いまはアプリを追加できません。
      </p>
    </div>
  );
}

// ---- 動いているアプリ ----

function PodsPanel({ pods }: { pods: PodUsage[] }) {
  return (
    <Panel title="動いているアプリ" aside={pods.length > 0 ? `${pods.length} 件` : undefined}>
      {pods.length === 0 ? (
        <EmptyState title="まだアプリはありません">
          ホスティングでアプリを置くと、ここに 1 つずつメモリと CPU の使い方が出ます。
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-surface-2 text-[13px] text-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  名前
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  メモリ（使用 / 上限）
                </th>
                {/* スマホでは列を減らし、CPU はメモリの下に出す（名前の列を細くしすぎない） */}
                <th scope="col" className="hidden px-4 py-2 text-right font-medium sm:table-cell">
                  CPU
                </th>
              </tr>
            </thead>
            <tbody>
              {pods.map((p) => (
                <PodRow key={p.name} pod={p} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function PodRow({ pod }: { pod: PodUsage }) {
  const u = usage({ used: pod.memoryUsed, limit: pod.memoryLimit });
  return (
    <tr className="border-t border-line align-top">
      <th scope="row" className="px-4 py-2 font-normal break-all text-ink">
        <Mono>{pod.name}</Mono>
      </th>
      <td className="w-px px-4 py-2 sm:w-auto sm:min-w-40">
        <p className="text-[13px] whitespace-nowrap text-ink-2 tabular-nums">
          {formatBytes(u.used)} / {u.unlimited ? <span className="text-muted">上限なし</span> : formatBytes(u.limit)}
          {!u.unlimited && <span className="ml-2 text-ink">{formatPercent(u.percent)}</span>}
        </p>
        <div className="mt-1 max-w-48">
          <UsageBar fill={u.fill} level={levelOf(u)} size="sm" />
        </div>
        <p className="mt-1 text-[13px] whitespace-nowrap text-ink-2 sm:hidden">CPU {formatCpu(num(pod.cpuUsedMillis))}</p>
      </td>
      <td className="hidden px-4 py-2 text-right whitespace-nowrap sm:table-cell">{formatCpu(num(pod.cpuUsedMillis))}</td>
    </tr>
  );
}

// ---- 読み込み中 ----

function CapacitySkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="読み込み中">
      <Panel title="あと置けるアプリ">
        <div className="grid grid-cols-2 gap-4 px-4 py-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        {["この環境の枠", "Mac mini 全体"].map((t) => (
          <Panel key={t} title={t}>
            <div className="space-y-3 px-4 py-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
