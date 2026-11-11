import { useState } from "react";
import { useDatabaseMutations, useDatabases, useHostingOptions } from "@/api/console";
import { describeMutationError } from "@/api/errors";
import type { Database } from "@/api/gen/taramanji/cloud/v1/console_pb";
import { btn, btnDanger, btnPrimary, Field, input, Legend, Status } from "@/components/Form";
import { EmptyState, Mono, PageHeader, Panel, Skeleton } from "@/components/Page";
import { QueryError } from "@/components/QueryError";
import { databaseStatus, engineLabel } from "@/lib/hosting";
import { StoreDisabled } from "@/pages/FunctionsPage";

const engines = [
  { id: "postgres", note: "表とSQL。関数ごとに専用のデータベースとユーザー" },
  { id: "redis", note: "キーと値。自分の接頭辞（<名前>:）のキーだけを触れる" },
] as const;

export function DatabasesPage() {
  const options = useHostingOptions();
  const enabled = options.data?.storeEnabled === true;
  const databases = useDatabases(enabled);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const opt = options.data;
  const current = databases.data?.databases.find((d) => d.name === open);

  return (
    <>
      <PageHeader
        title="データベース"
        description="共有の PostgreSQL / Redis から、データベースを切り出します。サイズは選ばず、使った分だけ共有のメモリとディスクを使います。"
        actions={
          enabled &&
          !creating &&
          !current && (
            <button type="button" className={btnPrimary} onClick={() => setCreating(true)}>
              データベースを作る
            </button>
          )
        }
      />
      {options.isPending ? (
        <Skeleton className="h-40" />
      ) : options.isError ? (
        <QueryError error={options.error} onRetry={() => void options.refetch()} />
      ) : !opt?.storeEnabled ? (
        <StoreDisabled repository={opt?.repository ?? ""} />
      ) : current ? (
        <Detail db={current} onClose={() => setOpen(null)} />
      ) : (
        <div className="space-y-4">
          {!opt.databasesEnabled && (
            <p role="status" className="rounded-md border border-line bg-surface px-4 py-3 text-warn">
              この環境では、共有の PostgreSQL / Redis が動いていません。定義（YAML）は作れますが、使えるようにはなりません。
            </p>
          )}
          {creating && <Create onClose={() => setCreating(false)} />}
          <Panel title="データベース">
            {databases.isPending ? (
              <div className="p-4">
                <Skeleton className="h-24" />
              </div>
            ) : databases.isError ? (
              <div className="p-4">
                <QueryError error={databases.error} onRetry={() => void databases.refetch()} />
              </div>
            ) : databases.data.databases.length === 0 ? (
              <EmptyState title="まだデータベースがありません">作ったあと、関数の「つなぐ」で選ぶと、接続先が環境変数として関数に入ります。</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left">
                  <thead className="border-b border-line bg-surface-2 text-[13px] text-ink-2">
                    <tr>
                      <th className="px-4 py-2 font-semibold">名前</th>
                      <th className="px-4 py-2 font-semibold">エンジン</th>
                      <th className="px-4 py-2 font-semibold">状態</th>
                      <th className="px-4 py-2 font-semibold">つないでいる関数</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line [&>tr:hover]:bg-surface-2">
                    {databases.data.databases.map((d) => {
                      const st = databaseStatus({ ...d, problem: d.source?.problem ?? "" });
                      return (
                        <tr key={d.name}>
                          <td className="px-4 py-2.5">
                            <button type="button" className="font-medium text-accent hover:underline" onClick={() => setOpen(d.name)}>
                              {d.name}
                            </button>
                          </td>
                          <td className="px-4 py-2.5 text-ink-2">{d.engine ? engineLabel(d.engine) : "—"}</td>
                          <td className="px-4 py-2.5">
                            <Status level={st.level} label={st.label} />
                          </td>
                          <td className="px-4 py-2.5">{d.functions.length > 0 ? <Mono>{d.functions.join(", ")}</Mono> : <span className="text-muted">なし</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}

function Create({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [engine, setEngine] = useState<string>("postgres");
  const { create } = useDatabaseMutations();
  return (
    <Panel title="データベースを作る">
      <form
        className="space-y-4 px-4 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({ name: name.trim(), engine }, { onSuccess: onClose });
        }}
      >
        <fieldset>
          <Legend info={<>PostgreSQL は表と SQL のデータベースで、関数ごとに専用のデータベースとユーザーを作ります。Redis はキーと値の置き場で、共有の Redis の中で <code>&lt;名前&gt;:</code> で始まるキーだけを触れるユーザーを作ります。どちらも環境に 1 台ある共有のものから切り出すので、大きさは選びません。</>}>エンジン</Legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {engines.map((e) => (
              <label key={e.id} className={`cursor-pointer rounded border px-3 py-2 ${engine === e.id ? "border-accent bg-accent-soft" : "border-line-strong hover:bg-surface-2"}`}>
                <input type="radio" name="engine" className="sr-only" checked={engine === e.id} onChange={() => setEngine(e.id)} />
                <span className="block font-medium text-ink">{engineLabel(e.id)}</span>
                <span className="block text-xs text-muted">{e.note}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="max-w-sm">
          <Field label="名前" hint="英小文字で始め、英小文字・数字・ハイフンで 40 文字まで。あとから変えられません" info={<>データベースの名前です。関数につなぐと、環境変数 <code>DB_&lt;名前&gt;_URL</code> などになります（ハイフンは <code>_</code>、英字は大文字）。PostgreSQL のデータベース名とユーザー名は、ハイフンを <code>_</code> にしたものです。</>}>
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="main" autoComplete="off" spellCheck={false} />
          </Field>
        </div>
        {create.isError && (
          <p role="alert" className="text-bad">
            {describeMutationError(create.error)}
          </p>
        )}
        <div className="flex gap-3">
          <button type="submit" className={btnPrimary} disabled={create.isPending || name.trim() === ""}>
            {create.isPending ? "作成中…" : "作る"}
          </button>
          <button type="button" className={btn} onClick={onClose}>
            やめる
          </button>
        </div>
      </form>
    </Panel>
  );
}

function Detail({ db, onClose }: { db: Database; onClose: () => void }) {
  const { remove } = useDatabaseMutations();
  const st = databaseStatus({ ...db, problem: db.source?.problem ?? "" });
  return (
    <div className="space-y-4">
      <Panel
        title={db.name}
        aside={
          <button type="button" className="text-accent hover:underline" onClick={onClose}>
            一覧に戻る
          </button>
        }
      >
        <dl className="grid gap-x-8 gap-y-3 px-4 py-4 sm:grid-cols-[auto_1fr]">
          <dt className="text-muted">エンジン</dt>
          <dd>{db.engine ? engineLabel(db.engine) : "—"}</dd>
          <dt className="text-muted">状態</dt>
          <dd>
            <Status level={st.level} label={st.label} />
            {st.detail && <p className="mt-1 break-all text-bad">{st.detail}</p>}
          </dd>
          <dt className="text-muted">つないでいる関数</dt>
          <dd>{db.functions.length > 0 ? <Mono>{db.functions.join(", ")}</Mono> : "なし"}</dd>
          <dt className="text-muted">YAML</dt>
          <dd>
            <a href={db.source?.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
              GitHub で見る
            </a>
          </dd>
        </dl>
      </Panel>

      <Panel title="つなぎ方">
        <div className="space-y-2 px-4 py-3 text-ink-2">
          <p>関数の編集画面の「つなぐ」でこのデータベースを選ぶと、次の環境変数が関数に入ります。値（パスワードを含む）は、画面にも git にも出ません。</p>
          <ul className="grid gap-1 font-mono text-[13px] text-ink sm:grid-cols-2">
            {db.envNames.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          {db.engine === "redis" && <p>Redis は共有なので、キーは必ず PREFIX（{db.name}:）で始めてください。ほかの接頭辞のキーは読み書きできません。</p>}
        </div>
      </Panel>

      <Panel title="データベースを消す">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <p className="text-ink-2">どの関数にもつながれていないときだけ消せます。ログインを止めるだけで、中身は残ります（同じ名前で作り直すと、また使えます）。</p>
          <button
            type="button"
            className={`${btnDanger} ml-auto`}
            disabled={remove.isPending}
            onClick={() => window.confirm(`データベース ${db.name} を消します。`) && remove.mutate({ name: db.name, revision: db.source?.revision ?? "" }, { onSuccess: onClose })}
          >
            消す
          </button>
          {remove.isError && (
            <p role="alert" className="w-full text-bad">
              {describeMutationError(remove.error)}
            </p>
          )}
        </div>
      </Panel>
    </div>
  );
}
