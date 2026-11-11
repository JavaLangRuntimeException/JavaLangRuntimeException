import { useState } from "react";
import { Link } from "react-router";
import { consoleApi, useApis, useBuckets, useComputeMutations, useFunctions, useHostingOptions } from "@/api/console";
import { describeMutationError } from "@/api/errors";
import type { Api, GetHostingOptionsResponse } from "@/api/gen/taramanji/cloud/v1/console_pb";
import { btn, btnDanger, btnPrimary, Field, input, Legend, Status } from "@/components/Form";
import { EmptyState, Mono, PageHeader, Panel, Skeleton } from "@/components/Page";
import { QueryError } from "@/components/QueryError";
import { DeployBadge, DeployHistory } from "@/components/Deploy";
import { ResourceEditor } from "@/components/ResourceEditor";
import { apiFormErrors, apiFormOf, apiSpecOf, emptyApiForm, type ApiForm } from "@/lib/hosting";
import { dnsNote } from "@/pages/CdnPage";
import { StoreDisabled } from "@/pages/FunctionsPage";

export function ApisPage() {
  const options = useHostingOptions();
  const enabled = options.data?.storeEnabled === true;
  const apis = useApis(enabled);
  const functions = useFunctions(enabled);
  const buckets = useBuckets(enabled);
  // undefined = 一覧、null = 新しく作る
  const [editing, setEditing] = useState<Api | null | undefined>(undefined);
  const opt = options.data;
  const functionNames = functions.data?.functions.map((f) => f.spec?.name ?? "").filter((n) => n !== "") ?? [];
  // CORS の候補: 公開しているバケット（画面をそこから配って、この API を呼ぶ形）
  const publicOrigins = buckets.data?.buckets.filter((b) => b.public && b.publicHost).map((b) => `https://${b.publicHost}`) ?? [];

  return (
    <>
      <PageHeader
        title="API Gateway"
        description={
          opt ? (
            <>
              <Mono>https://&lt;名前&gt;{opt.apiHostSuffix}</Mono> で公開し、パスごとに関数へ渡します（ログインなし。認証は関数か API キーで）。関数が 0 台なら、最初のリクエストで起こします。
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
        <div className="space-y-4">
          <Editor key={editing?.spec?.name ?? ""} api={editing} opt={options.data} functions={functionNames} publicOrigins={publicOrigins} onClose={() => setEditing(undefined)} />
          {editing?.spec && !editing.source?.problem && <KeysPanel api={editing} onChange={setEditing} />}
          {editing?.spec && <DeployHistory kind="apis" name={editing.spec.name} revision={editing.source?.revision} />}
        </div>
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
            <th className="px-4 py-2 font-semibold">デプロイ</th>
            <th className="px-4 py-2 font-semibold">認証</th>
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
                <DeployBadge kind="apis" name={api.spec?.name ?? ""} revision={api.source?.revision} />
              </td>
              <td className="px-4 py-2.5 text-ink-2">
                {api.spec?.auth === "api_key" ? `API キー（${api.spec.keys.length}）` : <span className="text-warn">なし</span>}
                {(api.spec?.corsOrigins.length ?? 0) > 0 && <span className="ml-1.5 rounded bg-accent-soft px-1.5 py-0.5 text-xs text-accent">CORS</span>}
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

function Editor({
  api,
  opt,
  functions,
  publicOrigins,
  onClose,
}: {
  api: Api | null;
  opt: GetHostingOptionsResponse;
  functions: string[];
  publicOrigins: string[];
  onClose: () => void;
}) {
  const isNew = api === null;
  const [form, setForm] = useState<ApiForm>(() => (api?.spec && !api.source?.problem ? apiFormOf(api.spec) : { ...emptyApiForm(functions), name: api?.spec?.name ?? "" }));
  const [showErrors, setShowErrors] = useState(false);
  const { applyApi, deleteApi } = useComputeMutations();
  const errors = apiFormErrors(form);
  const setRoute = (i: number, patch: Partial<{ path: string; function: string }>) =>
    setForm((f) => ({ ...f, routes: f.routes.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const host = `${form.name.trim() || "<名前>"}${opt.apiHostSuffix}`;
  const done = applyApi.data ?? deleteApi.data;
  // 一覧にない関数（消された・読めない）に渡しているルートも、選択肢に残して見えるようにする
  const choices = [...new Set([...functions, ...form.routes.map((r) => r.function).filter((n) => n !== "")])];

  return (
    <ResourceEditor
      title={isNew ? "API を作る" : (api.spec?.name ?? "")}
      source={api?.source ?? null}
      yamlLabel="Kubernetes の YAML（HTTPRoute）"
      yamlHint="各ルールは RequestHeaderModifier で X-Cloud-Function（渡し先の関数名）を set し、backendRefs を cloud-gw にします。認証・CORS は X-Cloud-Auth・X-Cloud-Api-Keys・X-Cloud-Cors を、どのルートにも同じ値で set します。"
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
        info={<>公開するホスト名の先頭です。<code>&lt;名前&gt;{opt.apiHostSuffix}</code> になり、DNS は作ったときに自動で登録されます。ログインなしで誰でも呼べるので、認証は関数側で確かめてください。CDN と同じ名前は使えません。</>}
        error={showErrors ? errors.name : undefined}
        hint={
          <>
            <Mono>
              https://{form.name.trim() || "<名前>"}
              {opt.apiHostSuffix}
            </Mono>{" "}
            で公開されます。この環境の中で重複できず、あとから変えられません
          </>
        }
      >
        <input className={`${input} max-w-sm`} value={form.name} disabled={!isNew} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="shop" autoComplete="off" spellCheck={false} />
      </Field>

      <fieldset>
        <Legend info={<>パスの先頭（前方一致）ごとに、渡し先の関数を決めます。<code>/api</code> は <code>/api</code> と <code>/api/…</code> に当たり、<code>/apiv2</code> には当たりません。複数当たるときは、長いパスが先です。どれにも当たらないパスは 404 になるので、<code>/</code> を 1 つ入れておくと安全です。</>}>ルート</Legend>
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

      <fieldset>
        <Legend
          info={
            <>
              API Gateway はログインなしで、誰でも呼べます。「API キー」にすると、API Gateway が <code>x-api-key</code> ヘッダーのキーを確かめ、違えば関数を起こさずに 401 を返します。
              通ったときは、キーの名前が <code>X-Api-Key-Name</code> で関数に届きます（キーそのものは届きません）。キーは保存したあと、下の「API キー」で作ります。
              ブラウザの JavaScript に書いたキーは誰でも見られるので、ブラウザから呼ぶ API の利用者の確認は、関数側（ログインなど）で行ってください。
            </>
          }
        >
          認証
        </Legend>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["none", "なし", "誰でも呼べる。認証が要るなら関数の中で確かめる"],
              ["api_key", "API キー", "x-api-key のキーが当たったときだけ関数に渡す"],
            ] as const
          ).map(([value, label, note]) => (
            <label key={value} className={`cursor-pointer rounded border px-3 py-2 ${form.auth === value ? "border-accent bg-accent-soft" : "border-line-strong hover:bg-surface-2"}`}>
              <input type="radio" name="auth" className="sr-only" checked={form.auth === value} onChange={() => setForm({ ...form, auth: value })} />
              <span className="block font-medium text-ink">{label}</span>
              <span className="block text-xs text-muted">{note}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <Legend
          info={
            <>
              ほかのオリジン（別のホスト名）の画面から、ブラウザでこの API を呼ぶときに使います。書いたオリジンにだけ <code>Access-Control-Allow-Origin</code> を返し、プリフライト（<code>OPTIONS</code>）には API Gateway が関数を起こさずに答えます。
              空なら CORS は関数まかせです。<code>*</code> はどこからでも許します。
            </>
          }
        >
          CORS（ブラウザから呼んでよいオリジン）
        </Legend>
        <textarea
          className={`${input} h-24 font-mono text-[13px]`}
          aria-label="許すオリジン（1 行に 1 つ）"
          placeholder={"https://site-storage-cloud.taramanji.com\nhttp://localhost:5173"}
          value={form.corsOrigins}
          onChange={(e) => setForm({ ...form, corsOrigins: e.target.value })}
          spellCheck={false}
        />
        {publicOrigins.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted">公開バケットから足す:</span>
            {publicOrigins
              .filter((o) => !form.corsOrigins.split(/\s+/).includes(o))
              .map((o) => (
                <button
                  key={o}
                  type="button"
                  className="rounded border border-line px-1.5 py-0.5 font-mono text-ink-2 hover:bg-surface-2"
                  onClick={() => setForm({ ...form, corsOrigins: [form.corsOrigins.trim(), o].filter((x) => x !== "").join("\n") })}
                >
                  + {o}
                </button>
              ))}
          </div>
        )}
        <p className={`mt-1 text-xs ${showErrors && errors.corsOrigins ? "text-bad" : "text-muted"}`}>
          {(showErrors && errors.corsOrigins) || "1 行に 1 つ。https://example.com の形（パスなし）か *。空なら CORS は関数まかせです。"}
        </p>
      </fieldset>
    </ResourceEditor>
  );
}

/** API キーの一覧と、作る・消す。キーそのものは作ったときに 1 回だけ見せる */
function KeysPanel({ api, onChange }: { api: Api; onChange: (api: Api) => void }) {
  const { createApiKey, deleteApiKey } = useComputeMutations();
  const [name, setName] = useState("");
  const [shown, setShown] = useState<{ name: string; key: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const spec = api.spec;
  if (!spec) return null;
  const editable = api.source?.formEditable !== false;
  return (
    <Panel title="API キー" aside={spec.auth === "api_key" ? `${spec.keys.length} / 5` : "認証が「なし」なので使われません"}>
      <div className="space-y-3 px-4 py-3">
        {shown && (
          <div role="status" className="rounded border border-warn px-3 py-2">
            <p className="font-medium text-ink">キー {shown.name} を作りました。この画面を離れると二度と見られません。今コピーして、安全な場所に置いてください。</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded bg-surface-2 px-2 py-1 font-mono text-[13px] text-ink">{shown.key}</code>
              <button
                type="button"
                className={btn}
                onClick={() => {
                  void navigator.clipboard?.writeText(shown.key).then(() => setCopied(true));
                }}
              >
                {copied ? "コピーしました" : "コピー"}
              </button>
            </div>
            <p className="mt-2 text-xs text-muted">
              使い方: <code>curl -H "x-api-key: {shown.key.slice(0, 12)}…" https://{api.host}/</code>
            </p>
          </div>
        )}
        {spec.keys.length === 0 ? (
          <p className="text-ink-2">まだキーがありません。{spec.auth === "api_key" && "キーがないあいだは、どのリクエストも 401 になります。"}</p>
        ) : (
          <ul className="divide-y divide-line rounded border border-line">
            {spec.keys.map((k) => (
              <li key={k.name} className="flex items-center gap-3 px-3 py-2">
                <span className="font-medium text-ink">{k.name}</span>
                <code className="font-mono text-[13px] text-muted">{k.prefix}…</code>
                <button
                  type="button"
                  className={`${btnDanger} ml-auto`}
                  disabled={!editable || deleteApiKey.isPending}
                  onClick={() =>
                    window.confirm(`キー ${k.name} を消します。このキーで呼んでいるところは 401 になります。`) &&
                    deleteApiKey.mutate({ api: spec.name, name: k.name, revision: api.source?.revision ?? "" }, { onSuccess: (res) => res.api && onChange(res.api) })
                  }
                >
                  消す
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            createApiKey.mutate(
              { api: spec.name, name: name.trim(), revision: api.source?.revision ?? "" },
              {
                onSuccess: (res) => {
                  setShown({ name: name.trim(), key: res.key });
                  setCopied(false);
                  setName("");
                  if (res.api) onChange(res.api);
                },
              },
            );
          }}
        >
          <div className="w-full max-w-xs">
            <Field label="キーの名前" hint="呼ぶ側の名前（例: ci・mobile）。関数には X-Api-Key-Name で届きます">
              <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="ci" autoComplete="off" spellCheck={false} disabled={!editable} />
            </Field>
          </div>
          <button type="submit" className={btnPrimary} disabled={!editable || createApiKey.isPending || name.trim() === "" || spec.keys.length >= 5}>
            {createApiKey.isPending ? "作成中…" : "キーを作る"}
          </button>
        </form>
        {!editable && <p className="text-xs text-muted">YAML を手で直している API なので、キーは YAML に書いてください。</p>}
        {(createApiKey.isError || deleteApiKey.isError) && (
          <p role="alert" className="text-bad">
            {describeMutationError(createApiKey.error ?? deleteApiKey.error)}
          </p>
        )}
      </div>
    </Panel>
  );
}
