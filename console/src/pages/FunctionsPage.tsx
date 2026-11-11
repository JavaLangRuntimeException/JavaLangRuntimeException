import { useState } from "react";
import { Link } from "react-router";
import { consoleApi, useBuckets, useComputeMutations, useDatabases, useFunctions, useHostingOptions } from "@/api/console";
import { describeMutationError } from "@/api/errors";
import type { Function as Fn, GetHostingOptionsResponse } from "@/api/gen/taramanji/cloud/v1/console_pb";
import { btn, btnPrimary, Field, input, Legend, Status } from "@/components/Form";
import { EmptyState, Mono, PageHeader, Panel, Skeleton } from "@/components/Page";
import { QueryError } from "@/components/QueryError";
import { DeployBadge, DeployHistory } from "@/components/Deploy";
import { ResourceEditor } from "@/components/ResourceEditor";
import { formatCpu, num } from "@/lib/capacity";
import { formatBytes } from "@/lib/format";
import {
  emptyForm,
  familyLabels,
  groupByFamily,
  engineLabel,
  envPrefix,
  formatIdle,
  formErrors,
  formOf,
  isCustom,
  notifyLabel,
  specOf,
  statusOf,
  toggle,
  typeOptions,
  withInstanceType,
  type FunctionForm,
  type Limits,
  type TypeOption,
} from "@/lib/hosting";

const MIB = 1024 ** 2;

export function FunctionsPage() {
  const options = useHostingOptions();
  const functions = useFunctions(options.data?.storeEnabled === true);
  // undefined = 一覧、null = 新しく作る
  const [editing, setEditing] = useState<Fn | null | undefined>(undefined);
  const opt = options.data;

  return (
    <>
      <PageHeader
        title="Functions"
        description={
          opt
            ? `コンテナイメージを、リクエストが来たときだけ動かします。${formatIdle(opt.idleTimeoutSeconds)}来なければ 0 台に戻ります。外からは API Gateway を通して呼びます。`
            : "コンテナイメージを、リクエストが来たときだけ動かします。"
        }
        actions={
          opt?.storeEnabled &&
          editing === undefined && (
            <button type="button" className={btnPrimary} onClick={() => setEditing(null)}>
              関数を作る
            </button>
          )
        }
      />
      {options.isPending ? (
        <Skeleton className="h-40" />
      ) : options.isError ? (
        <QueryError error={options.error} onRetry={() => void options.refetch()} />
      ) : !options.data.storeEnabled ? (
        <StoreDisabled repository={options.data.repository} />
      ) : editing !== undefined ? (
        <div className="space-y-4">
          <Editor key={editing?.spec?.name ?? ""} fn={editing} opt={options.data} onClose={() => setEditing(undefined)} />
          {editing?.spec && <DeployHistory kind="functions" name={editing.spec.name} revision={editing.source?.revision} />}
        </div>
      ) : (
        <div className="space-y-4">
          <Panel title="関数">
            {functions.isPending ? (
              <div className="p-4">
                <Skeleton className="h-24" />
              </div>
            ) : functions.isError ? (
              <div className="p-4">
                <QueryError error={functions.error} onRetry={() => void functions.refetch()} />
              </div>
            ) : functions.data.functions.length === 0 ? (
              <EmptyState title="まだ関数がありません">
                イメージとインスタンスタイプを選ぶと、Kubernetes の YAML がリポジトリに保存されます。そのあと API Gateway でホスト名を付けると、外から呼べます。
              </EmptyState>
            ) : (
              <FunctionTable functions={functions.data.functions} onOpen={setEditing} />
            )}
          </Panel>
          <SourcePanel opt={options.data} />
        </div>
      )}
    </>
  );
}

export function StoreDisabled({ repository }: { repository: string }) {
  return (
    <Panel>
      <EmptyState title="YAML を置くリポジトリがつながっていません">
        リポジトリ（<Mono>{repository || "未設定"}</Mono>）に書き込むトークンを <Mono>deploy/cloud/secrets/apps-repo-token</Mono> に置いて、
        <Mono>seal.sh</Mono> を実行してください。
      </EmptyState>
    </Panel>
  );
}

function FunctionTable({ functions, onOpen }: { functions: Fn[]; onOpen: (fn: Fn) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left">
        <thead className="border-b border-line bg-surface-2 text-[13px] text-ink-2">
          <tr>
            <th className="px-4 py-2 font-semibold">名前</th>
            <th className="px-4 py-2 font-semibold">状態</th>
            <th className="px-4 py-2 font-semibold">デプロイ</th>
            <th className="px-4 py-2 font-semibold">インスタンスタイプ</th>
            <th className="px-4 py-2 font-semibold">監視</th>
            <th className="px-4 py-2 font-semibold">API</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line [&>tr:hover]:bg-surface-2">
          {functions.map((fn) => {
            const spec = fn.spec;
            const problem = fn.source?.problem ?? "";
            const st = statusOf({ ...fn, problem });
            return (
              <tr key={spec?.name}>
                <td className="px-4 py-2.5">
                  <button type="button" className="font-medium text-accent hover:underline" onClick={() => onOpen(fn)}>
                    {spec?.name}
                  </button>
                </td>
                <td className="px-4 py-2.5">
                  <Status level={st.level} label={st.label} />
                </td>
                <td className="px-4 py-2.5">
                  <DeployBadge kind="functions" name={spec?.name ?? ""} revision={fn.source?.revision} />
                </td>
                <td className="px-4 py-2.5">
                  {problem ? (
                    <span className="text-muted">—</span>
                  ) : (
                    <>
                      <Mono>{spec?.instanceType}</Mono>
                      {fn.customResources && <span className="ml-1.5 rounded bg-accent-soft px-1.5 py-0.5 text-xs text-accent">カスタム</span>}
                      <span className="block text-xs text-muted">
                        {formatCpu(num(spec?.cpuMillis))} / {formatBytes(num(spec?.memory))}
                      </span>
                    </>
                  )}
                </td>
                <td className="px-4 py-2.5 text-ink-2">{spec && spec.alerts.length > 0 ? `${spec.alerts.length} 個` : "なし"}</td>
                <td className="px-4 py-2.5">
                  {fn.apis.length > 0 ? (
                    <Mono>{fn.apis.join(", ")}</Mono>
                  ) : (
                    <Link to="/apis" className="text-accent hover:underline">
                      API を作る
                    </Link>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** YAML の置き場と、監視の同期 */
function SourcePanel({ opt }: { opt: GetHostingOptionsResponse }) {
  const { syncAlerts } = useComputeMutations();
  return (
    <Panel title="YAML の置き場">
      <div className="space-y-2 px-4 py-3 text-ink-2">
        <p>
          関数の定義は、リポジトリ <Mono>{opt.repository}</Mono> の <Mono>{opt.directory}/functions/&lt;名前&gt;.yaml</Mono> にある Kubernetes の YAML
          です。ここで保存するとコミットされ、15 秒ほどでコントローラーがクラスターに入れます（Argo CD は使いません）。YAML を手で書いて push しても同じように扱います。
        </p>
        {opt.alertsEnabled ? (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={btn} disabled={syncAlerts.isPending} onClick={() => syncAlerts.mutate()}>
              監視を同期
            </button>
            <span className="text-xs text-muted">YAML を手で push したあとに押すと、Datadog のモニターを YAML に合わせます。</span>
            {syncAlerts.isSuccess && (
              <span role="status" className="text-xs text-ok">
                作成 {syncAlerts.data.created}・更新 {syncAlerts.data.updated}・削除 {syncAlerts.data.deleted}
              </span>
            )}
            {syncAlerts.isError && (
              <span role="alert" className="text-xs text-bad">
                {describeMutationError(syncAlerts.error)}
              </span>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted">この環境は Datadog で監視していないので、選んだ監視は YAML に残るだけで、通知は飛びません（本番だけ）。</p>
        )}
      </div>
    </Panel>
  );
}

function Editor({ fn, opt, onClose }: { fn: Fn | null; opt: GetHostingOptionsResponse; onClose: () => void }) {
  const types = typeOptions(opt.instanceTypes);
  const limits: Limits = {
    minCpu: num(opt.minCpuMillis),
    maxCpu: num(opt.maxCpuMillis),
    minMemoryMib: num(opt.minMemory) / MIB,
    maxMemoryMib: num(opt.maxMemory) / MIB,
  };
  const isNew = fn === null;
  const [form, setForm] = useState<FunctionForm>(() => (fn?.spec && !fn.source?.problem ? formOf(fn.spec) : { ...emptyForm(types), name: fn?.spec?.name ?? "" }));
  const [showErrors, setShowErrors] = useState(false);
  const { applyFunction, deleteFunction } = useComputeMutations();
  const errors = formErrors(form, limits);
  const set = (patch: Partial<FunctionForm>) => setForm((f) => ({ ...f, ...patch }));
  const err = (k: keyof FunctionForm) => (showErrors ? errors[k] : undefined);
  const alertsProblem = applyFunction.data?.alertsProblem || deleteFunction.data?.alertsProblem;

  return (
    <ResourceEditor
      title={isNew ? "関数を作る" : (fn.spec?.name ?? "")}
      source={fn?.source ?? null}
      yamlLabel="Kubernetes の YAML（登録・Deployment・Service）"
      yamlHint="登録の ConfigMap（function-<名前>）と、関数の namespace（cloud-fn-<名前> など）に入る Deployment・Service。spec.replicas は書きません。Pod には priorityClassName: cloud-workload が必要です。"
      formValid={() => {
        setShowErrors(true);
        return Object.keys(errors).length === 0;
      }}
      preview={async () => (await consoleApi.previewFunction({ spec: specOf(form) })).yaml}
      onSave={(yaml) =>
        applyFunction.mutate(
          { spec: yaml === null ? specOf(form) : { name: form.name.trim() }, yaml: yaml ?? "", revision: fn?.source?.revision ?? "" },
          { onSuccess: (res) => !res.alertsProblem && onClose() },
        )
      }
      onDelete={() => {
        if (!fn?.spec || !window.confirm(`${fn.spec.name} を消します。YAML がリポジトリから消え、数分で関数がなくなります。`)) return;
        deleteFunction.mutate({ name: fn.spec.name, revision: fn.source?.revision ?? "" }, { onSuccess: (res) => !res.alertsProblem && onClose() });
      }}
      onClose={onClose}
      saving={applyFunction.isPending || deleteFunction.isPending}
      error={applyFunction.error ?? deleteFunction.error}
      warning={alertsProblem ? `YAML は保存しましたが、監視を Datadog に反映できませんでした: ${alertsProblem}（一覧の「監視を同期」でやり直せます）` : undefined}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="名前" error={err("name")} hint="あとから変えられません" info={<>関数の名前です。YAML のファイル名（<code>functions/&lt;名前&gt;.yaml</code>）、Kubernetes の Deployment・Service の名前、関数ごとの namespace（<code>cloud-fn-&lt;名前&gt;</code>）になります。英小文字で始め、英小文字・数字・ハイフンで 40 文字まで。公開する URL は API Gateway で別に決めます。</>}>
          <input className={input} value={form.name} disabled={!isNew} onChange={(e) => set({ name: e.target.value })} placeholder="blog" autoComplete="off" spellCheck={false} />
        </Field>
        <Field label="ポート" error={err("port")} hint="コンテナが HTTP を受けるポート" info={<>コンテナの中のアプリが HTTP を待ち受けているポート番号です（Node の <code>listen(8080)</code> なら 8080）。API Gateway はこのポートにリクエストを渡します。HTTPS ではなく HTTP で受けてください（証明書は Cloudflare が持ちます）。</>}>
          <input className={input} inputMode="numeric" value={form.port} onChange={(e) => set({ port: e.target.value })} />
        </Field>
      </div>
      <Field label="イメージ" error={err("image")} hint="公開されているイメージだけ使えます。起動が速いほど、最初のリクエストの待ち時間が短くなります" info={<>動かすコンテナイメージです（例: <code>ghcr.io/owner/app:v1</code>）。非公開のイメージはまだ使えません。タグを変えて保存すると、次に起きたときから新しい版で動きます。<code>latest</code> は版がわからなくなるので、版の付いたタグをおすすめします。</>}>
        <input className={`${input} font-mono text-[13px]`} value={form.image} onChange={(e) => set({ image: e.target.value })} placeholder="ghcr.io/owner/name:tag" autoComplete="off" spellCheck={false} />
      </Field>

      <InstanceTypePicker form={form} types={types} families={opt.instanceFamilies} limits={limits} errors={{ cpuMillis: err("cpuMillis"), memoryMib: err("memoryMib") }} onChange={setForm} />
      <EnvEditor form={form} error={err("env")} onChange={set} />
      <ConnectionPicker form={form} onChange={set} />
      <AlertPicker form={form} opt={opt} onChange={set} />
    </ResourceEditor>
  );
}

function InstanceTypePicker({
  form,
  types,
  families,
  limits,
  errors,
  onChange,
}: {
  form: FunctionForm;
  types: TypeOption[];
  families: readonly { id: string; label: string; description: string }[];
  limits: Limits;
  errors: { cpuMillis?: string; memoryMib?: string };
  onChange: (f: FunctionForm) => void;
}) {
  const custom = isCustom(form, types);
  const groups = groupByFamily(types, families.map((f) => f.id));
  const current = types.find((t) => t.name === form.instanceType);
  return (
    <fieldset>
      <Legend info={<>関数 1 台あたりの CPU とメモリの組み合わせです。名前は EC2 と同じ「ファミリー + 世代 . サイズ」です。汎用の <code>t1</code>、CPU が多い <code>c1</code>（コンピューティング最適化）、メモリが多い <code>r1</code>（メモリ最適化）から選べます。型を選ぶと下の CPU とメモリが入り、そのあと個別に変えられます。変えたものは一覧に「カスタム」と出ます。</>}>インスタンスタイプ</Legend>
      <div className="space-y-3">
        {groups.map((g) => {
          const fam = families.find((f) => f.id === g.family);
          return (
            <div key={g.family}>
              <p className="mb-1.5 flex flex-wrap items-baseline gap-x-2">
                <span className="text-[13px] font-semibold text-ink">
                  {fam?.label ?? familyLabels[g.family] ?? g.family}
                  <span className="ml-1 font-mono font-normal text-muted">{g.family}</span>
                </span>
                {fam && <span className="text-xs text-muted">{fam.description}</span>}
              </p>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                {g.items.map((t) => {
                  const on = t.name === form.instanceType;
                  return (
                    <label key={t.name} className={`cursor-pointer rounded border px-3 py-2 ${on ? "border-accent bg-accent-soft" : "border-line-strong hover:bg-surface-2"}`}>
                      <input type="radio" name="instance-type" className="sr-only" checked={on} onChange={() => onChange(withInstanceType(form, t))} />
                      <span className="block font-mono text-[13px] font-semibold text-ink">{t.name}</span>
                      <span className="block text-xs text-muted">
                        {formatCpu(t.cpuMillis)} / {formatBytes(t.memoryMib * MIB)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <Field label="CPU（ミリコア）" error={errors.cpuMillis} hint={`${limits.minCpu}〜${limits.maxCpu}。1000 で 1 CPU`} info={<>使える CPU の上限です。1000 ミリコアで CPU 1 つ分。上限まで使うと遅くなりますが、止まりはしません。予約（requests）と上限（limits）は同じ値になり、予約した分は必ず使えます。</>}>
          <input className={input} inputMode="numeric" value={form.cpuMillis} onChange={(e) => onChange({ ...form, cpuMillis: e.target.value })} />
        </Field>
        <Field label="メモリ（MiB）" error={errors.memoryMib} hint={`${limits.minMemoryMib}〜${limits.maxMemoryMib}。超えると再起動されます`} info={<>使えるメモリの上限です。超えると関数は強制終了され（OOMKilled）、再起動されます。動いているあいだは、この量をこの環境の枠から予約します（0 台のときは予約しません）。残りは「容量」で見られます。</>}>
          <input className={input} inputMode="numeric" value={form.memoryMib} onChange={(e) => onChange({ ...form, memoryMib: e.target.value })} />
        </Field>
      </div>
      <p className="mt-2 text-xs text-muted">
        型を選ぶと CPU とメモリが入ります。そのあと個別に変えられます。
        {custom && current && (
          <>
            {" "}
            <span className="rounded bg-accent-soft px-1.5 py-0.5 text-accent">カスタム</span>{" "}
            <button type="button" className="text-accent hover:underline" onClick={() => onChange(withInstanceType(form, current))}>
              {current.name} の値に戻す
            </button>
          </>
        )}
      </p>
    </fieldset>
  );
}

function EnvEditor({ form, error, onChange }: { form: FunctionForm; error?: string; onChange: (p: Partial<FunctionForm>) => void }) {
  const update = (i: number, patch: Partial<{ name: string; value: string }>) => onChange({ env: form.env.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  return (
    <fieldset>
      <Legend info={<>関数に渡す設定の値です。YAML に書かれて git に残るので、パスワードやトークンなどの秘密は入れないでください。データベースやバケットの接続先は、下の「つなぐ」で選ぶと自動で入ります。</>}>環境変数</Legend>
      <div className="space-y-2">
        {form.env.map((e, i) => (
          // 行に固有の ID がないので、並びの位置をキーにする（並べ替えはしない）
          <div key={i} className="flex gap-2">
            <input className={`${input} font-mono text-[13px]`} aria-label="名前" placeholder="NAME" value={e.name} onChange={(ev) => update(i, { name: ev.target.value })} spellCheck={false} />
            <input className={`${input} font-mono text-[13px]`} aria-label="値" placeholder="値" value={e.value} onChange={(ev) => update(i, { value: ev.target.value })} spellCheck={false} />
            <button type="button" className={`${btn} shrink-0 whitespace-nowrap`} aria-label={`${e.name || "この行"} を消す`} onClick={() => onChange({ env: form.env.filter((_, j) => j !== i) })}>
              消す
            </button>
          </div>
        ))}
      </div>
      <button type="button" className={`${btn} mt-2`} onClick={() => onChange({ env: [...form.env, { name: "", value: "" }] })}>
        環境変数を足す
      </button>
      <p className={`mt-1 text-xs ${error ? "text-bad" : "text-muted"}`}>{error ?? "秘密（パスワード・トークン）は入れないでください。YAML は git に残ります。"}</p>
    </fieldset>
  );
}

function AlertPicker({ form, opt, onChange }: { form: FunctionForm; opt: GetHostingOptionsResponse; onChange: (p: Partial<FunctionForm>) => void }) {
  return (
    <fieldset>
      <Legend info={<>選んだものが、本番では Datadog のモニターになり、条件を満たすと Datadog に出ます。stg・dev は Datadog で見ていないので、YAML に残るだけです。通知先（メール・Discord）は宛先をまだ用意していないので、空のままにしてください。</>}>監視</Legend>
      <ul className="divide-y divide-line rounded border border-line">
        {opt.alertPresets.map((p) => (
          <li key={p.id}>
            <label className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-surface-2">
              <input type="checkbox" className="mt-1" checked={form.alerts.includes(p.id)} onChange={() => onChange({ alerts: toggle(form.alerts, p.id) })} />
              <span>
                <span className="block font-medium text-ink">{p.label}</span>
                <span className="block text-xs text-muted">{p.description}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="text-xs font-medium text-ink-2">通知先</span>
        <span className="text-ink-2">Datadog（必ず出ます）</span>
        {opt.notifyChannels.map((c) => (
          <label key={c} className="inline-flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={form.notify.includes(c)} disabled={form.alerts.length === 0} onChange={() => onChange({ notify: toggle(form.notify, c) })} />
            <span className="text-ink">{notifyLabel(c)}</span>
          </label>
        ))}
      </div>
      {!opt.alertsEnabled && <p className="mt-2 text-xs text-muted">この環境は Datadog で監視していないので、選んでも通知は飛びません（YAML には残ります）。</p>}
    </fieldset>
  );
}

/** つなぐデータベースとバケット。接続先（URL・パスワード・トークン）は、接頭辞の付いた環境変数として関数に入る */
function ConnectionPicker({ form, onChange }: { form: FunctionForm; onChange: (p: Partial<FunctionForm>) => void }) {
  const databases = useDatabases(true).data?.databases ?? [];
  const buckets = useBuckets(true).data?.buckets ?? [];
  // 一覧にないもの（消された）も、外せるように残す
  const dbRows = [...databases.map((d) => ({ name: d.name, note: engineLabel(d.engine) })), ...form.databases.filter((n) => !databases.some((d) => d.name === n)).map((name) => ({ name, note: "見つかりません" }))];
  const bucketRows = [...buckets.map((b) => b.name), ...form.buckets.filter((n) => !buckets.some((b) => b.name === n))];
  return (
    <fieldset>
      <Legend info={<>選んだデータベースとバケットの接続先（URL・ユーザー・パスワード・トークン）が、<code>DB_&lt;名前&gt;_URL</code>・<code>BUCKET_&lt;名前&gt;_URL</code> などの環境変数として関数に入ります。値は画面にも git にも出ません。つないでいるあいだは、そのデータベース・バケットを消せません。</>}>つなぐ</Legend>
      {dbRows.length === 0 && bucketRows.length === 0 ? (
        <p className="text-ink-2">
          データベースやバケットを作ると、ここでつなげます。接続先は環境変数として関数に入り、パスワードは画面にも git にも出ません。
        </p>
      ) : (
        <ul className="divide-y divide-line rounded border border-line">
          {dbRows.map((d) => (
            <li key={`db-${d.name}`}>
              <label className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-surface-2">
                <input type="checkbox" className="mt-1" checked={form.databases.includes(d.name)} onChange={() => onChange({ databases: toggle(form.databases, d.name) })} />
                <span>
                  <span className="block font-medium text-ink">
                    データベース {d.name} <span className="font-normal text-muted">（{d.note}）</span>
                  </span>
                  <span className="block font-mono text-xs text-muted">{envPrefix("database", d.name)}URL ほか</span>
                </span>
              </label>
            </li>
          ))}
          {bucketRows.map((name) => (
            <li key={`bucket-${name}`}>
              <label className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-surface-2">
                <input type="checkbox" className="mt-1" checked={form.buckets.includes(name)} onChange={() => onChange({ buckets: toggle(form.buckets, name) })} />
                <span>
                  <span className="block font-medium text-ink">バケット {name}</span>
                  <span className="block font-mono text-xs text-muted">
                    {envPrefix("bucket", name)}URL・{envPrefix("bucket", name)}TOKEN
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
