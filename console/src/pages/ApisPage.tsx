import { useState } from "react";
import { Link } from "react-router";
import { consoleApi, useApis, useComputeMutations, useFunctions, useHostingOptions } from "@/api/console";
import type { Api, GetHostingOptionsResponse } from "@/api/gen/taramanji/cloud/v1/console_pb";
import { btn, btnPrimary, Field, input, Status } from "@/components/Form";
import { EmptyState, Mono, PageHeader, Panel, Skeleton } from "@/components/Page";
import { QueryError } from "@/components/QueryError";
import { ResourceEditor } from "@/components/ResourceEditor";
import { apiFormErrors, apiFormOf, apiSpecOf, emptyApiForm, type ApiForm } from "@/lib/hosting";
import { dnsNote } from "@/pages/CdnPage";
import { StoreDisabled } from "@/pages/FunctionsPage";

export function ApisPage() {
  const options = useHostingOptions();
  const enabled = options.data?.storeEnabled === true;
  const apis = useApis(enabled);
  const functions = useFunctions(enabled);
  // undefined = 一覧、null = 新しく作る
  const [editing, setEditing] = useState<Api | null | undefined>(undefined);
  const opt = options.data;
  const functionNames = functions.data?.functions.map((f) => f.spec?.name ?? "").filter((n) => n !== "") ?? [];

  return (
    <>
      <PageHeader
        title="API Gateway"
        description={
          opt ? (
            <>
              <Mono>https://&lt;名前&gt;{opt.hostSuffix}</Mono> で公開し、パスごとに関数へ渡します。関数が 0 台なら、最初のリクエストで起こします。
            </>
          ) : (
            "ホスト名を付けて公開し、パスごとに関数へ渡します。"
          )
        }
        actions={
          enabled &&
          editing === undefined && (
            <button type="button" className={btnPrimary} onClick={() => setEditing(null)}>
              API を作る
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
        <Editor key={editing?.spec?.name ?? ""} api={editing} opt={options.data} functions={functionNames} onClose={() => setEditing(undefined)} />
      ) : (
        <Panel title="API">
          {apis.isPending ? (
            <div className="p-4">
              <Skeleton className="h-24" />
            </div>
          ) : apis.isError ? (
            <div className="p-4">
              <QueryError error={apis.error} onRetry={() => void apis.refetch()} />
            </div>
          ) : apis.data.apis.length === 0 ? (
            <EmptyState title="まだ API がありません">
              {functionNames.length === 0 ? (
                <>
                  先に{" "}
                  <Link to="/functions" className="text-accent hover:underline">
                    関数
                  </Link>{" "}
                  を作ってください。API は、ホスト名とパスを関数に結びつけます。
                </>
              ) : (
                "名前を決めると、その名前のホスト名で関数を公開できます。名前はこの環境の中で重複できません。"
              )}
            </EmptyState>
          ) : (
            <ApiTable apis={apis.data.apis} onOpen={setEditing} />
          )}
        </Panel>
      )}
    </>
  );
}

function ApiTable({ apis, onOpen }: { apis: Api[]; onOpen: (api: Api) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left">
        <thead className="border-b border-line bg-surface-2 text-[13px] text-ink-2">
          <tr>
            <th className="px-4 py-2 font-semibold">名前</th>
            <th className="px-4 py-2 font-semibold">URL</th>
            <th className="px-4 py-2 font-semibold">ルート</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line [&>tr:hover]:bg-surface-2">
          {apis.map((api) => (
            <tr key={api.spec?.name} className="align-top">
              <td className="px-4 py-2.5">
                <button type="button" className="font-medium text-accent hover:underline" onClick={() => onOpen(api)}>
                  {api.spec?.name}
                </button>
              </td>
              <td className="px-4 py-2.5">
                <a href={`https://${api.host}`} target="_blank" rel="noreferrer" className="font-mono text-[13px] text-accent hover:underline">
                  {api.host}
                </a>
              </td>
              <td className="px-4 py-2.5">
                {api.source?.problem ? (
                  <Status level="bad" label="YAML に問題" />
                ) : (
                  <ul className="space-y-0.5">
                    {api.spec?.routes.map((r) => (
                      <li key={r.path} className="font-mono text-[13px] text-ink-2">
                        {r.path} → {r.function}
                      </li>
                    ))}
                  </ul>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Editor({ api, opt, functions, onClose }: { api: Api | null; opt: GetHostingOptionsResponse; functions: string[]; onClose: () => void }) {
  const isNew = api === null;
  const [form, setForm] = useState<ApiForm>(() => (api?.spec && !api.source?.problem ? apiFormOf(api.spec) : { ...emptyApiForm(functions), name: api?.spec?.name ?? "" }));
  const [showErrors, setShowErrors] = useState(false);
  const { applyApi, deleteApi } = useComputeMutations();
  const errors = apiFormErrors(form);
  const setRoute = (i: number, patch: Partial<{ path: string; function: string }>) =>
    setForm((f) => ({ ...f, routes: f.routes.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const host = `${form.name.trim() || "<名前>"}${opt.hostSuffix}`;
  const done = applyApi.data ?? deleteApi.data;
  // 一覧にない関数（消された・読めない）に渡しているルートも、選択肢に残して見えるようにする
  const choices = [...new Set([...functions, ...form.routes.map((r) => r.function).filter((n) => n !== "")])];

  return (
    <ResourceEditor
      title={isNew ? "API を作る" : (api.spec?.name ?? "")}
      source={api?.source ?? null}
      yamlLabel="Kubernetes の YAML（HTTPRoute）"
      yamlHint="各ルールは RequestHeaderModifier で X-Cloud-Function（渡し先の関数名）を set し、backendRefs を cloud-gw にします。"
      formValid={() => {
        setShowErrors(true);
        return Object.keys(errors).length === 0;
      }}
      preview={async () => (await consoleApi.previewApi({ spec: apiSpecOf(form) })).yaml}
      onSave={(yaml) =>
        applyApi.mutate(
          { spec: yaml === null ? apiSpecOf(form) : { name: form.name.trim() }, yaml: yaml ?? "", revision: api?.source?.revision ?? "" },
          { onSuccess: (res) => !dnsNote(opt.dnsEnabled, res.dnsProblem, host) && onClose() },
        )
      }
      onDelete={() => {
        if (!api?.spec || !window.confirm(`${api.spec.name} を消します。https://${api.host} は使えなくなります（関数は残ります）。`)) return;
        deleteApi.mutate({ name: api.spec.name, revision: api.source?.revision ?? "" }, { onSuccess: (res) => !res.dnsProblem && onClose() });
      }}
      onClose={onClose}
      saving={applyApi.isPending || deleteApi.isPending}
      error={applyApi.error ?? deleteApi.error}
      warning={done ? dnsNote(opt.dnsEnabled, done.dnsProblem, host) : undefined}
    >
      <Field
        label="名前"
        error={showErrors ? errors.name : undefined}
        hint={
          <>
            <Mono>
              https://{form.name.trim() || "<名前>"}
              {opt.hostSuffix}
            </Mono>{" "}
            で公開されます。この環境の中で重複できず、あとから変えられません
          </>
        }
      >
        <input className={`${input} max-w-sm`} value={form.name} disabled={!isNew} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="shop" autoComplete="off" spellCheck={false} />
      </Field>

      <fieldset>
        <legend className="mb-2 text-xs font-medium text-ink-2">ルート</legend>
        <div className="space-y-2">
          {form.routes.map((r, i) => (
            // 行に固有の ID がないので、並びの位置をキーにする（並べ替えはしない）
            <div key={i} className="flex gap-2">
              <input className={`${input} font-mono text-[13px]`} aria-label="パス" placeholder="/" value={r.path} onChange={(e) => setRoute(i, { path: e.target.value })} spellCheck={false} />
              <select className={input} aria-label="渡し先の関数" value={r.function} onChange={(e) => setRoute(i, { function: e.target.value })}>
                <option value="">関数を選ぶ</option>
                {choices.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={`${btn} shrink-0 whitespace-nowrap`}
                disabled={form.routes.length === 1}
                aria-label={`${r.path || "この行"} を消す`}
                onClick={() => setForm({ ...form, routes: form.routes.filter((_, j) => j !== i) })}
              >
                消す
              </button>
            </div>
          ))}
        </div>
        <button type="button" className={`${btn} mt-2`} onClick={() => setForm({ ...form, routes: [...form.routes, { path: "", function: functions[0] ?? "" }] })}>
          ルートを足す
        </button>
        <p className={`mt-1 text-xs ${showErrors && errors.routes ? "text-bad" : "text-muted"}`}>
          {(showErrors && errors.routes) || "パスは前方一致です。/api は /api と /api/… に当たり、長いパスが先に当たります。"}
        </p>
      </fieldset>
    </ResourceEditor>
  );
}
