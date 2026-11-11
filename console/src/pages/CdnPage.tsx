import { useState } from "react";
import { consoleApi, useBuckets, useDistributions, useFunctions, useHostingOptions, useStorageMutations } from "@/api/console";
import type { Distribution, GetHostingOptionsResponse } from "@/api/gen/taramanji/cloud/v1/console_pb";
import { btnPrimary, Field, InfoTip, input, Legend, Status } from "@/components/Form";
import { EmptyState, Mono, PageHeader, Panel, Skeleton } from "@/components/Page";
import { QueryError } from "@/components/QueryError";
import { DeployBadge, DeployHistory } from "@/components/Deploy";
import { ResourceEditor } from "@/components/ResourceEditor";
import {
  aliasLabelError,
  cachePresets,
  distributionFormErrors,
  distributionFormOf,
  distributionSpecOf,
  emptyBehavior,
  emptyDistributionForm,
  formatCache,
  MAX_BEHAVIORS,
  type BehaviorForm,
  type DistributionForm,
} from "@/lib/hosting";
import { StoreDisabled } from "@/pages/FunctionsPage";

/** DNS を自動で登録できない・できなかったときの案内 */
export function dnsNote(dnsEnabled: boolean, problem: string | undefined, host: string): string | undefined {
  if (problem) return `保存しましたが、DNS を変えられませんでした: ${problem}`;
  if (!dnsEnabled) return `保存しました。DNS は自動で登録されないので、cloudflared tunnel route dns taramanji-cloud ${host} を実行してください。`;
  return undefined;
}

export function CdnPage() {
  const options = useHostingOptions();
  const enabled = options.data?.storeEnabled === true;
  const dists = useDistributions(enabled);
  const buckets = useBuckets(enabled);
  const functions = useFunctions(enabled);
  // undefined = 一覧、null = 新しく作る
  const [editing, setEditing] = useState<Distribution | null | undefined>(undefined);
  const opt = options.data;
  const bucketNames = buckets.data?.buckets.map((b) => b.name) ?? [];
  const functionNames = functions.data?.functions.map((f) => f.spec?.name ?? "").filter((n) => n !== "") ?? [];

  return (
    <>
      <PageHeader
        title="CDN"
        description={
          opt ? (
            <>
              バケットか関数を <Mono>https://&lt;名前&gt;{opt.cdnHostSuffix}</Mono> で出し、Cloudflare のエッジにキャッシュさせます（Cloudflare Access のログインあり）。
            </>
          ) : (
            "バケットか関数にホスト名を付けて公開し、キャッシュさせます。"
          )
        }
        actions={
          enabled &&
          editing === undefined && (
            <button type="button" className={btnPrimary} onClick={() => setEditing(null)}>
              CDN を作る
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
          <Editor key={editing?.spec?.name ?? ""} dist={editing} opt={options.data} buckets={bucketNames} functions={functionNames} onClose={() => setEditing(undefined)} />
          {editing?.spec && <DeployHistory kind="cdn" name={editing.spec.name} revision={editing.source?.revision} />}
        </div>
      ) : (
        <Panel title="ディストリビューション">
          {dists.isPending ? (
            <div className="p-4">
              <Skeleton className="h-24" />
            </div>
          ) : dists.isError ? (
            <div className="p-4">
              <QueryError error={dists.error} onRetry={() => void dists.refetch()} />
            </div>
          ) : dists.data.distributions.length === 0 ? (
            <EmptyState title="まだ CDN がありません">
              バケットに置いたサイトや、関数の応答を、名前の付いた URL で公開できます。名前は API と合わせて、この環境の中で重複できません。
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left">
                <thead className="border-b border-line bg-surface-2 text-[13px] text-ink-2">
                  <tr>
                    <th className="px-4 py-2 font-semibold">名前</th>
                    <th className="px-4 py-2 font-semibold">URL</th>
                    <th className="px-4 py-2 font-semibold">デプロイ</th>
                    <th className="px-4 py-2 font-semibold">元</th>
                    <th className="px-4 py-2 font-semibold">キャッシュ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line [&>tr:hover]:bg-surface-2">
                  {dists.data.distributions.map((d) => (
                    <tr key={d.spec?.name}>
                      <td className="px-4 py-2.5">
                        <button type="button" className="font-medium text-accent hover:underline" onClick={() => setEditing(d)}>
                          {d.spec?.name}
                        </button>
                      </td>
                      <td className="px-4 py-2.5">
                        <a href={`https://${d.host}`} target="_blank" rel="noreferrer" className="font-mono text-[13px] text-accent hover:underline">
                          {d.host}
                        </a>
                        {(d.spec?.aliases ?? []).map((a) => (
                          <a key={a} href={`https://${a}`} target="_blank" rel="noreferrer" className="block font-mono text-[13px] text-accent hover:underline">
                            {a}
                          </a>
                        ))}
                      </td>
                      <td className="px-4 py-2.5">
                        <DeployBadge kind="cdn" name={d.spec?.name ?? ""} revision={d.source?.revision} />
                      </td>
                      {d.source?.problem ? (
                        <td className="px-4 py-2.5" colSpan={2}>
                          <Status level="bad" label="YAML に問題" />
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-2.5 text-ink-2">
                            <ul className="space-y-0.5">
                              {(d.spec?.behaviors ?? []).map((b) => (
                                <li key={b.path}>
                                  <Mono>{b.path}</Mono> → {b.originType === "function" ? "関数" : "バケット"} <Mono>{b.origin}</Mono>
                                  {b.spa && <span className="ml-1.5 rounded bg-accent-soft px-1.5 py-0.5 text-xs text-accent">SPA</span>}
                                </li>
                              ))}
                              <li>
                                {(d.spec?.behaviors.length ?? 0) > 0 && (
                                  <>
                                    <Mono>/</Mono> →{" "}
                                  </>
                                )}
                                {d.spec?.originType === "function" ? "関数" : "バケット"} <Mono>{d.spec?.origin}</Mono>
                                {d.spec?.spa && <span className="ml-1.5 rounded bg-accent-soft px-1.5 py-0.5 text-xs text-accent">SPA</span>}
                              </li>
                            </ul>
                          </td>
                          <td className="px-4 py-2.5 text-ink-2">{formatCache(d.spec?.cacheSeconds ?? 0)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
    </>
  );
}

function Editor({
  dist,
  opt,
  buckets,
  functions,
  onClose,
}: {
  dist: Distribution | null;
  opt: GetHostingOptionsResponse;
  buckets: string[];
  functions: string[];
  onClose: () => void;
}) {
  const isNew = dist === null;
  const [form, setForm] = useState<DistributionForm>(() =>
    dist?.spec && !dist.source?.problem ? distributionFormOf(dist.spec) : { ...emptyDistributionForm(buckets), name: dist?.spec?.name ?? "" },
  );
  const [showErrors, setShowErrors] = useState(false);
  const { applyDistribution, deleteDistribution } = useStorageMutations();
  const errors = distributionFormErrors(form);
  const set = (patch: Partial<DistributionForm>) => setForm((f) => ({ ...f, ...patch }));
  const err = (k: Exclude<keyof DistributionForm, "behaviors">) => (showErrors ? errors[k] : undefined);
  const host = `${form.name.trim() || "<名前>"}${opt.cdnHostSuffix}`;
  const origins = form.originType === "bucket" ? buckets : functions;
  // 一覧にない元（消された）も、選択肢に残して見えるようにする
  const choices = form.origin && !origins.includes(form.origin) ? [...origins, form.origin] : origins;
  const done = applyDistribution.data ?? deleteDistribution.data;
  const warning = done ? dnsNote(opt.dnsEnabled, done.dnsProblem, host) : undefined;

  return (
    <ResourceEditor
      title={isNew ? "CDN を作る" : (dist.spec?.name ?? "")}
      source={dist?.source ?? null}
      yamlLabel="Kubernetes の YAML（HTTPRoute）"
      yamlHint="形は決まっています。変えられるのは、パス・元の名前・キャッシュの秒数・SPA の値だけです（長いパスから順に並べ、最後は / のルール）。"
      formValid={() => {
        setShowErrors(true);
        return Object.keys(errors).length === 0;
      }}
      preview={async () => (await consoleApi.previewDistribution({ spec: distributionSpecOf(form) })).yaml}
      onSave={(yaml) =>
        applyDistribution.mutate(
          { spec: yaml === null ? distributionSpecOf(form) : { name: form.name.trim() }, yaml: yaml ?? "", revision: dist?.source?.revision ?? "" },
          { onSuccess: (res) => !dnsNote(opt.dnsEnabled, res.dnsProblem, host) && onClose() },
        )
      }
      onDelete={() => {
        if (!dist?.spec || !window.confirm(`${dist.spec.name} を消します。https://${dist.host} は使えなくなります（元のバケット・関数は残ります）。`)) return;
        deleteDistribution.mutate({ name: dist.spec.name, revision: dist.source?.revision ?? "" }, { onSuccess: (res) => !res.dnsProblem && onClose() });
      }}
      onClose={onClose}
      saving={applyDistribution.isPending || deleteDistribution.isPending}
      error={applyDistribution.error ?? deleteDistribution.error}
      warning={warning}
    >
      <Field
        label="名前"
        info={<>ホスト名の先頭です。<code>&lt;名前&gt;{opt.cdnHostSuffix}</code> になり、DNS は作ったときに自動で登録されます。開くと Cloudflare Access のログインが出ます（自分だけ）。API と同じ名前は使えません。</>}
        error={err("name")}
        hint={
          <>
            <Mono>https://{host}</Mono> で公開されます。API と合わせてこの環境の中で重複できず、あとから変えられません
          </>
        }
      >
        <input className={`${input} max-w-sm`} value={form.name} disabled={!isNew} onChange={(e) => set({ name: e.target.value })} placeholder="www" autoComplete="off" spellCheck={false} />
      </Field>

      <fieldset>
        <Legend info={<>どこから中身を取ってくるかです。下の「パスごとの元」に当たらないパス（<code>/</code>）は、すべてここに送ります。バケットなら、置いたファイルをパスのとおりに返します（読むだけ）。関数なら、関数の応答にキャッシュの長さを付けて返します（関数が自分で <code>Cache-Control</code> を付けていればそちらを使います）。</>}>元（オリジン）・既定</Legend>
        <div className="flex flex-wrap gap-2">
          {(["bucket", "function"] as const).map((t) => (
            <label key={t} className={`cursor-pointer rounded border px-3 py-2 ${form.originType === t ? "border-accent bg-accent-soft" : "border-line-strong hover:bg-surface-2"}`}>
              <input
                type="radio"
                name="origin-type"
                className="sr-only"
                checked={form.originType === t}
                onChange={() => set({ originType: t, origin: (t === "bucket" ? buckets : functions)[0] ?? "", spa: false })}
              />
              <span className="block font-medium text-ink">{t === "bucket" ? "バケット" : "関数"}</span>
              <span className="block text-xs text-muted">{t === "bucket" ? "置いたファイルをそのまま配る" : "関数の応答をキャッシュする"}</span>
            </label>
          ))}
        </div>
        <div className="mt-3 max-w-sm">
          <Field label={form.originType === "bucket" ? "バケット" : "関数"} error={err("origin")} info={form.originType === "bucket" ? <>中身を配るバケットです。<code>/</code> で終わるパスには、その下の <code>index.html</code> を返します。</> : <>応答をキャッシュさせる関数です。関数が 0 台なら、最初のリクエストで起こします。</>}>
            <select className={input} value={form.origin} onChange={(e) => set({ origin: e.target.value })}>
              <option value="">選ぶ</option>
              {choices.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {form.originType === "bucket" && (
          <label className="mt-3 flex cursor-pointer items-start gap-2">
            <input type="checkbox" className="mt-1" checked={form.spa} onChange={(e) => set({ spa: e.target.checked })} />
            <span>
              <span className="flex items-center gap-1.5 text-ink">
                ファイルがないパスに index.html を返す（SPA）
                <InfoTip label="SPA">
                  React Router などで画面側がルーティングするサイト向けです。<code>/users/1</code> のようにファイルがないパスにも、一番上の <code>index.html</code> を 200 で返します。付けないときは 404 を返します。
                </InfoTip>
              </span>
              <span className="block text-xs text-muted">画面側でルーティングするサイト向け。付けないときは 404 を返します。</span>
            </span>
          </label>
        )}
      </fieldset>

      <fieldset>
        <Legend info={<>応答に <code>Cache-Control: public, max-age=&lt;秒&gt;</code> を付けます。その間は Cloudflare のエッジが応答を持ち、元に取りに来ません。Cloudflare の既定では、画像・CSS・JS などの拡張子だけがキャッシュされ、HTML はされません。キャッシュの消去はまだできないので、同じ名前で中身を変えるファイルは短めにしてください。</>}>キャッシュの長さ（既定の元）</Legend>
        <div className="flex flex-wrap items-center gap-2">
          {cachePresets.map((p) => (
            <button
              key={p.seconds}
              type="button"
              aria-pressed={Number(form.cacheSeconds) === p.seconds}
              onClick={() => set({ cacheSeconds: String(p.seconds) })}
              className={`rounded border px-3 py-1.5 ${Number(form.cacheSeconds) === p.seconds ? "border-accent bg-accent-soft font-medium text-ink" : "border-line-strong text-ink-2 hover:bg-surface-2"}`}
            >
              {p.label}
            </button>
          ))}
          <label className="flex items-center gap-2">
            <input className={`${input} w-28`} inputMode="numeric" aria-label="キャッシュの秒数" value={form.cacheSeconds} onChange={(e) => set({ cacheSeconds: e.target.value })} />
            <span className="text-ink-2">秒</span>
          </label>
        </div>
        <p className={`mt-1 text-xs ${err("cacheSeconds") ? "text-bad" : "text-muted"}`}>
          {err("cacheSeconds") ??
            "応答に Cache-Control: public, max-age を付けます。Cloudflare は画像・CSS・JS などをこの長さでキャッシュします（HTML は Cloudflare の既定ではキャッシュされません）。"}
        </p>
      </fieldset>

      <fieldset>
        <Legend
          info={
            <>
              CloudFront の behavior にあたります。パスの前方一致ごとに、別の元に送れます（例: <code>/api</code> は関数、それ以外は画面のバケット）。長いパスが先に当たり、どれにも当たらないものは上の既定の元に行きます。
              パスはそのまま元に渡ります（<code>/api/x</code> なら関数にも <code>/api/x</code> が届きます）。画面と API を同じホスト名にまとめると、Cloudflare Access のログインもそのまま使えます。
            </>
          }
        >
          パスごとの元
        </Legend>
        {form.behaviors.length === 0 ? (
          <p className="text-sm text-muted">ありません。全部のパスを既定の元に送ります。</p>
        ) : (
          <ul className="space-y-2">
            {form.behaviors.map((b, i) => (
              <BehaviorRow
                key={i}
                row={b}
                buckets={buckets}
                functions={functions}
                error={showErrors ? errors.behaviors?.[i] : undefined}
                onChange={(patch) => set({ behaviors: form.behaviors.map((x, j) => (j === i ? { ...x, ...patch } : x)) })}
                onRemove={() => set({ behaviors: form.behaviors.filter((_, j) => j !== i) })}
              />
            ))}
          </ul>
        )}
        {showErrors && errors.behaviors?.[MAX_BEHAVIORS] && <p className="mt-1 text-xs text-bad">{errors.behaviors[MAX_BEHAVIORS]}</p>}
        <button
          type="button"
          className="mt-2 rounded border border-line-strong px-3 py-1.5 text-sm text-ink-2 hover:bg-surface-2 disabled:opacity-50"
          disabled={form.behaviors.length >= MAX_BEHAVIORS}
          onClick={() => set({ behaviors: [...form.behaviors, emptyBehavior(buckets, functions)] })}
        >
          パスを足す
        </button>
      </fieldset>

      {!isNew && <AliasesField zone={opt.customDomainZone} aliases={form.aliases} onChange={(aliases) => set({ aliases })} />}
    </ResourceEditor>
  );
}

/** パスごとの元 1 行: パス・元の種類・元・キャッシュ・SPA */
function BehaviorRow({
  row,
  buckets,
  functions,
  error,
  onChange,
  onRemove,
}: {
  row: BehaviorForm;
  buckets: string[];
  functions: string[];
  error?: string;
  onChange: (patch: Partial<BehaviorForm>) => void;
  onRemove: () => void;
}) {
  const origins = row.originType === "bucket" ? buckets : functions;
  const choices = row.origin && !origins.includes(row.origin) ? [...origins, row.origin] : origins;
  const presets: { seconds: number; label: string }[] = [...cachePresets];
  if (!presets.some((p) => String(p.seconds) === row.cacheSeconds)) presets.push({ seconds: Number(row.cacheSeconds) || 0, label: formatCache(Number(row.cacheSeconds) || 0) });
  return (
    <li className={`rounded border px-3 py-2 ${error ? "border-bad" : "border-line"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${input} w-36 font-mono`} aria-label="パス" value={row.path} onChange={(e) => onChange({ path: e.target.value })} placeholder="/api" spellCheck={false} />
        <span className="text-muted">→</span>
        <select
          className={`${input} w-28`}
          aria-label="元の種類"
          value={row.originType}
          onChange={(e) => {
            const t = e.target.value === "function" ? "function" : "bucket";
            onChange({ originType: t, origin: (t === "bucket" ? buckets : functions)[0] ?? "", spa: false, cacheSeconds: t === "function" ? "0" : "300" });
          }}
        >
          <option value="bucket">バケット</option>
          <option value="function">関数</option>
        </select>
        <select className={`${input} w-48`} aria-label={row.originType === "bucket" ? "バケット" : "関数"} value={row.origin} onChange={(e) => onChange({ origin: e.target.value })}>
          <option value="">選ぶ</option>
          {choices.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <select className={`${input} w-36`} aria-label="キャッシュの長さ" value={row.cacheSeconds} onChange={(e) => onChange({ cacheSeconds: e.target.value })}>
          {presets.map((p) => (
            <option key={p.seconds} value={String(p.seconds)}>
              {p.label}
            </option>
          ))}
        </select>
        {row.originType === "bucket" && (
          <label className="flex items-center gap-1.5 text-sm text-ink-2">
            <input type="checkbox" checked={row.spa} onChange={(e) => onChange({ spa: e.target.checked })} />
            SPA
          </label>
        )}
        <button type="button" className="ml-auto rounded px-2 py-1 text-sm text-muted hover:bg-surface-2 hover:text-bad" onClick={onRemove} aria-label={`${row.path} を外す`}>
          外す
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-bad">{error}</p>}
    </li>
  );
}

/** 独自ドメイン（CloudFront の代替ドメイン名）。CDN を作ったあとに足せる。保存すると Access に登録してから DNS を作る */
function AliasesField({ zone, aliases, onChange }: { zone: string; aliases: string[]; onChange: (aliases: string[]) => void }) {
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | undefined>();
  const add = () => {
    const l = label.trim().toLowerCase();
    const e = aliasLabelError(l) ?? (aliases.includes(`${l}.${zone}`) ? "もう足してあります" : aliases.length >= 5 ? "5 個までです" : undefined);
    setError(e);
    if (e) return;
    onChange([...aliases, `${l}.${zone}`].sort());
    setLabel("");
  };
  return (
    <fieldset>
      <Legend
        info={
          <>
            CloudFront の代替ドメイン名にあたります。<code>&lt;ラベル&gt;.{zone || "taramanji.com"}</code> でも、この CDN を開けるようにします。
            保存すると、先に Cloudflare Access に登録してから（ログインあり）DNS を作ります。外すと DNS を消してから Access から外します。
            taramanji.com がもう使っている名前（www・gws・stg など）や、ほかの DNS レコードがある名前は使えません。
          </>
        }
      >
        独自ドメイン
      </Legend>
      {!zone ? (
        <p className="text-sm text-muted">この環境では使えません（Cloudflare Access と DNS のトークンが要ります）。</p>
      ) : (
        <>
          {aliases.length > 0 && (
            <ul className="mb-2 space-y-1">
              {aliases.map((a) => (
                <li key={a} className="flex items-center gap-2">
                  <Mono>https://{a}</Mono>
                  <button type="button" className="rounded px-2 py-0.5 text-sm text-muted hover:bg-surface-2 hover:text-bad" onClick={() => onChange(aliases.filter((x) => x !== a))}>
                    外す
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input
              className={`${input} w-48 font-mono`}
              aria-label="独自ドメインのラベル"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              placeholder="qa"
              spellCheck={false}
            />
            <span className="font-mono text-ink-2">.{zone}</span>
            <button type="button" className="rounded border border-line-strong px-3 py-1.5 text-sm text-ink-2 hover:bg-surface-2 disabled:opacity-50" disabled={label.trim() === "" || aliases.length >= 5} onClick={add}>
              足す
            </button>
          </div>
          <p className={`mt-1 text-xs ${error ? "text-bad" : "text-muted"}`}>{error ?? "足したあと「保存」を押すと反映されます（5 個まで）。"}</p>
        </>
      )}
    </fieldset>
  );
}
