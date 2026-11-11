import { useState, type ReactNode } from "react";
import { consoleApi, useApps, useHostingMutations, useHostingOptions, useOverview } from "@/api/console";
import { describeMutationError } from "@/api/errors";
import type { App, GetHostingOptionsResponse } from "@/api/gen/taramanji/cloud/v1/console_pb";
import { EmptyState, Mono, Panel, Skeleton } from "@/components/Page";
import { QueryError } from "@/components/QueryError";
import { formatCpu, num } from "@/lib/capacity";
import { formatBytes } from "@/lib/format";
import {
  emptyForm,
  formErrors,
  formOf,
  isCustom,
  notifyLabel,
  specOf,
  statusOf,
  toggle,
  typeOptions,
  withInstanceType,
  type AppForm,
  type Limits,
  type TypeOption,
} from "@/lib/hosting";

const MIB = 1024 ** 2;

const input = "w-full rounded border border-line-strong bg-surface px-2.5 py-1.5 text-ink placeholder:text-muted disabled:bg-surface-2 disabled:text-muted";
const btn = "rounded border border-line-strong px-3 py-1.5 font-medium text-ink hover:bg-surface-2 disabled:opacity-50";
const btnPrimary = "rounded border border-accent bg-accent px-3 py-1.5 font-medium text-surface hover:opacity-90 disabled:opacity-50";
const btnDanger = "rounded border border-line-strong px-3 py-1.5 font-medium text-bad hover:bg-surface-2 disabled:opacity-50";

const levelColor = { ok: "bg-ok", warn: "bg-warn", bad: "bg-bad", off: "bg-line-strong" } as const;

/** 編集中のもの。name が空なら新しく作る */
type Editing = { app: App | null };

export function ContainersPanel() {
  const options = useHostingOptions();
  const enabled = options.data?.storeEnabled === true;
  const apps = useApps(enabled);
  const [editing, setEditing] = useState<Editing | null>(null);

  if (options.isPending) return <Skeleton className="h-40" />;
  if (options.isError) return <QueryError error={options.error} onRetry={() => void options.refetch()} />;
  const opt = options.data;

  if (!opt.storeEnabled) {
    return (
      <Panel title="コンテナ">
        <EmptyState title="アプリ用のリポジトリがつながっていません">
          アプリの YAML を置くリポジトリ（<Mono>{opt.repository || "未設定"}</Mono>）に書き込むトークンを、
          <Mono>deploy/cloud/secrets/apps-repo-token</Mono> に置いて <Mono>seal.sh</Mono> を実行してください。
        </EmptyState>
      </Panel>
    );
  }

  if (editing) {
    return <Editor key={editing.app?.spec?.name ?? ""} app={editing.app} opt={opt} onClose={() => setEditing(null)} />;
  }

  return (
    <div className="space-y-4">
      <Panel
        title="コンテナ"
        aside={
          <button type="button" className={btnPrimary} onClick={() => setEditing({ app: null })}>
            コンテナを作る
          </button>
        }
      >
        {apps.isPending ? (
          <div className="p-4">
            <Skeleton className="h-24" />
          </div>
        ) : apps.isError ? (
          <div className="p-4">
            <QueryError error={apps.error} onRetry={() => void apps.refetch()} />
          </div>
        ) : apps.data.apps.length === 0 ? (
          <EmptyState title="まだコンテナがありません">
            イメージとインスタンスタイプを選ぶと、Kubernetes の YAML がリポジトリに保存され、数分で動き始めます。
          </EmptyState>
        ) : (
          <AppTable apps={apps.data.apps} onOpen={(app) => setEditing({ app })} />
        )}
      </Panel>
      <Source opt={opt} />
    </div>
  );
}

function AppTable({ apps, onOpen }: { apps: App[]; onOpen: (app: App) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left">
        <thead className="border-b border-line text-xs text-muted">
          <tr>
            <th className="px-4 py-2 font-medium">名前</th>
            <th className="px-4 py-2 font-medium">状態</th>
            <th className="px-4 py-2 font-medium">インスタンスタイプ</th>
            <th className="px-4 py-2 font-medium">監視</th>
            <th className="px-4 py-2 font-medium">URL</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {apps.map((app) => {
            const spec = app.spec;
            const st = statusOf(app);
            return (
              <tr key={spec?.name}>
                <td className="px-4 py-2.5">
                  <button type="button" className="font-medium text-accent hover:underline" onClick={() => onOpen(app)}>
                    {spec?.name}
                  </button>
                </td>
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden className={`size-2 rounded-full ${levelColor[st.level]}`} />
                    <span className="text-ink-2">{st.label}</span>
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  {app.problem ? (
                    <span className="text-muted">—</span>
                  ) : (
                    <>
                      <Mono>{spec?.instanceType}</Mono>
                      {app.customResources && <span className="ml-1.5 rounded bg-accent-soft px-1.5 py-0.5 text-xs text-accent">カスタム</span>}
                      <span className="block text-xs text-muted">
                        {formatCpu(num(spec?.cpuMillis))} / {formatBytes(num(spec?.memory))} × {spec?.replicas}
                      </span>
                    </>
                  )}
                </td>
                <td className="px-4 py-2.5 text-ink-2">{spec && spec.alerts.length > 0 ? `${spec.alerts.length} 個` : "なし"}</td>
                <td className="px-4 py-2.5">
                  <a href={`https://${app.host}`} target="_blank" rel="noreferrer" className="font-mono text-[13px] text-accent hover:underline">
                    {app.host}
                  </a>
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
function Source({ opt }: { opt: GetHostingOptionsResponse }) {
  const { syncAlerts } = useHostingMutations();
  return (
    <Panel title="YAML の置き場">
      <div className="space-y-2 px-4 py-3 text-ink-2">
        <p>
          コンテナの定義は、リポジトリ <Mono>{opt.repository}</Mono> の <Mono>{opt.directory}/&lt;名前&gt;.yaml</Mono> にある Kubernetes の YAML
          です。ここで保存するとコミットされ、Argo CD がクラスターに入れます。YAML を手で書いて push しても同じように扱います。
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

function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-2">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-bad">{error}</span> : hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

function Editor({ app, opt, onClose }: { app: App | null; opt: GetHostingOptionsResponse; onClose: () => void }) {
  const types = typeOptions(opt.instanceTypes);
  const limits: Limits = {
    minCpu: num(opt.minCpuMillis),
    maxCpu: num(opt.maxCpuMillis),
    minMemoryMib: num(opt.minMemory) / MIB,
    maxMemoryMib: num(opt.maxMemory) / MIB,
    maxReplicas: opt.maxReplicas,
  };
  const isNew = app === null;
  // 手で書き足した YAML（フォームで作り直せない）と、読めない YAML は、YAML のまま編集する
  const formOk = isNew || (app.formEditable && !app.problem);
  const [form, setForm] = useState<AppForm>(() => (app?.spec && !app.problem ? formOf(app.spec) : { ...emptyForm(types), name: app?.spec?.name ?? "" }));
  const [mode, setMode] = useState<"form" | "yaml">(formOk ? "form" : "yaml");
  const [yaml, setYaml] = useState(app?.yaml ?? "");
  // YAML を手で直したら、保存は YAML をそのまま送る（フォームに戻ると捨てる）
  const [yamlDirty, setYamlDirty] = useState(!formOk);
  const [showErrors, setShowErrors] = useState(false);
  const [previewError, setPreviewError] = useState<unknown>(null);
  const { apply, remove } = useHostingMutations();
  const suffix = useOverview().data?.hostingHostSuffix ?? "";
  const errors = formErrors(form, limits);
  const set = (patch: Partial<AppForm>) => setForm((f) => ({ ...f, ...patch }));
  const busy = apply.isPending || remove.isPending;

  const openYaml = async () => {
    if (!yamlDirty) {
      if (Object.keys(errors).length > 0) {
        setShowErrors(true);
        return;
      }
      try {
        setPreviewError(null);
        setYaml((await consoleApi.previewApp({ spec: specOf(form) })).yaml);
      } catch (e) {
        setPreviewError(e);
        return;
      }
    }
    setMode("yaml");
  };

  const save = () => {
    const byYaml = mode === "yaml" && yamlDirty;
    if (!byYaml && Object.keys(errors).length > 0) {
      setShowErrors(true);
      return;
    }
    apply.mutate(
      { spec: byYaml ? { name: form.name.trim() } : specOf(form), yaml: byYaml ? yaml : "", revision: app?.revision ?? "" },
      { onSuccess: (res) => !res.alertsProblem && onClose() },
    );
  };

  const del = () => {
    if (!app?.spec || !window.confirm(`${app.spec.name} を消します。YAML がリポジトリから消え、数分でコンテナが止まります。`)) return;
    remove.mutate({ name: app.spec.name, revision: app.revision }, { onSuccess: (res) => !res.alertsProblem && onClose() });
  };

  const err = (k: keyof AppForm) => (showErrors ? errors[k] : undefined);
  const saved = apply.data?.alertsProblem || remove.data?.alertsProblem;

  return (
    <Panel
      title={isNew ? "コンテナを作る" : app.spec?.name}
      aside={
        <button type="button" className="text-accent hover:underline" onClick={onClose}>
          一覧に戻る
        </button>
      }
    >
      <div className="flex gap-1 border-b border-line px-4" role="tablist" aria-label="編集のしかた">
        {(["form", "yaml"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            disabled={m === "form" && !formOk}
            onClick={() => {
              if (m === "yaml") void openYaml();
              else if (!yamlDirty || window.confirm("YAML に直接入れた変更を捨てて、フォームに戻りますか？")) {
                setYamlDirty(false);
                setMode("form");
              }
            }}
            className={`-mb-px border-b-2 px-3 py-2 disabled:opacity-50 ${mode === m ? "border-accent font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}
          >
            {m === "form" ? "フォーム" : "YAML"}
          </button>
        ))}
      </div>

      <div className="space-y-6 px-4 py-4">
        {app?.problem && (
          <p role="alert" className="rounded border border-line bg-surface-2 px-3 py-2 text-bad">
            この YAML は読めません: {app.problem}
          </p>
        )}
        {!formOk && !app?.problem && (
          <p className="rounded border border-line bg-surface-2 px-3 py-2 text-ink-2">
            この YAML には手で書き足した部分があるので、フォームでは編集できません（フォームで保存すると消えてしまうため）。
          </p>
        )}

        {mode === "form" ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="名前" error={err("name")} hint={`https://${form.name.trim() || "<名前>"}${suffix} で公開されます`}>
                <input className={input} value={form.name} disabled={!isNew} onChange={(e) => set({ name: e.target.value })} placeholder="blog" autoComplete="off" spellCheck={false} />
              </Field>
              <Field label="イメージ" error={err("image")} hint="公開されているイメージだけ使えます">
                <input className={`${input} font-mono text-[13px]`} value={form.image} onChange={(e) => set({ image: e.target.value })} placeholder="ghcr.io/owner/name:tag" autoComplete="off" spellCheck={false} />
              </Field>
              <Field label="ポート" error={err("port")} hint="コンテナが HTTP を受けるポート">
                <input className={input} inputMode="numeric" value={form.port} onChange={(e) => set({ port: e.target.value })} />
              </Field>
              <Field label="台数" error={err("replicas")} hint={`0 にすると止まります（最大 ${limits.maxReplicas}）`}>
                <input className={input} inputMode="numeric" value={form.replicas} onChange={(e) => set({ replicas: e.target.value })} />
              </Field>
            </div>

            <InstanceTypePicker form={form} types={types} limits={limits} errors={{ cpuMillis: err("cpuMillis"), memoryMib: err("memoryMib") }} onChange={setForm} />

            <EnvEditor form={form} error={err("env")} onChange={set} />

            <AlertPicker form={form} opt={opt} onChange={set} />
          </>
        ) : (
          <Field label="Kubernetes の YAML（Deployment・Service・HTTPRoute）" hint="namespace は書きません。Pod には priorityClassName: cloud-workload が必要です。">
            <textarea
              className={`${input} h-[28rem] font-mono text-[13px] leading-5`}
              value={yaml}
              spellCheck={false}
              onChange={(e) => {
                setYaml(e.target.value);
                setYamlDirty(true);
              }}
            />
          </Field>
        )}

        {previewError != null && (
          <p role="alert" className="text-bad">
            {describeMutationError(previewError)}
          </p>
        )}
        {apply.isError && (
          <p role="alert" className="text-bad">
            {describeMutationError(apply.error)}
          </p>
        )}
        {remove.isError && (
          <p role="alert" className="text-bad">
            {describeMutationError(remove.error)}
          </p>
        )}
        {saved && (
          <p role="alert" className="text-warn">
            YAML は保存しましたが、監視を Datadog に反映できませんでした: {saved}（一覧の「監視を同期」でやり直せます）
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <button type="button" className={btnPrimary} disabled={busy} onClick={save}>
            {apply.isPending ? "保存中…" : isNew ? "作る" : "保存する"}
          </button>
          <button type="button" className={btn} disabled={busy} onClick={onClose}>
            {saved ? "閉じる" : "やめる"}
          </button>
          {!isNew && (
            <>
              <a href={app.sourceUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                GitHub で YAML を見る
              </a>
              <button type="button" className={`${btnDanger} ml-auto`} disabled={busy} onClick={del}>
                消す
              </button>
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}

function InstanceTypePicker({
  form,
  types,
  limits,
  errors,
  onChange,
}: {
  form: AppForm;
  types: TypeOption[];
  limits: Limits;
  errors: { cpuMillis?: string; memoryMib?: string };
  onChange: (f: AppForm) => void;
}) {
  const custom = isCustom(form, types);
  const current = types.find((t) => t.name === form.instanceType);
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-medium text-ink-2">インスタンスタイプ</legend>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {types.map((t) => {
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
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <Field label="CPU（ミリコア）" error={errors.cpuMillis} hint={`${limits.minCpu}〜${limits.maxCpu}。1000 で 1 CPU`}>
          <input className={input} inputMode="numeric" value={form.cpuMillis} onChange={(e) => onChange({ ...form, cpuMillis: e.target.value })} />
        </Field>
        <Field label="メモリ（MiB）" error={errors.memoryMib} hint={`${limits.minMemoryMib}〜${limits.maxMemoryMib}。超えると再起動されます`}>
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

function EnvEditor({ form, error, onChange }: { form: AppForm; error?: string; onChange: (p: Partial<AppForm>) => void }) {
  const update = (i: number, patch: Partial<{ name: string; value: string }>) => onChange({ env: form.env.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-medium text-ink-2">環境変数</legend>
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

function AlertPicker({ form, opt, onChange }: { form: AppForm; opt: GetHostingOptionsResponse; onChange: (p: Partial<AppForm>) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-medium text-ink-2">監視</legend>
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
