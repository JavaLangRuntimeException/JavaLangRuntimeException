import { useState } from "react";
import { useHostingOptions, useSecretMutations, useSecrets } from "@/api/console";
import { describeMutationError } from "@/api/errors";
import type { Secret } from "@/api/gen/taramanji/cloud/v1/console_pb";
import { btn, btnDanger, btnPrimary, Field, input, Status } from "@/components/Form";
import { EmptyState, Mono, PageHeader, Panel, Skeleton } from "@/components/Page";
import { QueryError } from "@/components/QueryError";
import { DeployHistory } from "@/components/Deploy";
import { secretStatus, secretValueNote } from "@/lib/hosting";
import { StoreDisabled } from "@/pages/FunctionsPage";

const MAX_BYTES = 64 * 1024;

export function SecretsPage() {
  const options = useHostingOptions();
  const enabled = options.data?.storeEnabled === true;
  const secrets = useSecrets(enabled);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const opt = options.data;
  const current = secrets.data?.secrets.find((s) => s.name === open);
  const canCreate = enabled && opt?.secretsEnabled === true;

  return (
    <>
      <PageHeader
        title="Secrets Manager"
        description="API キーやパスワードなどの秘密の値を、クラスターの鍵で暗号化して置き、つないだ関数にだけ環境変数として渡します。値は二度と表示されません。"
        actions={
          canCreate &&
          !creating &&
          !current && (
            <button type="button" className={btnPrimary} onClick={() => setCreating(true)}>
              シークレットを作る
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
        <Detail secret={current} onClose={() => setOpen(null)} />
      ) : (
        <div className="space-y-4">
          {!opt.secretsEnabled && (
            <p role="status" className="rounded-md border border-line bg-surface px-4 py-3 text-warn">
              この環境では Sealed Secrets がつながっていないので、シークレットを作れません。
            </p>
          )}
          {creating && <Create onClose={() => setCreating(false)} />}
          <Panel title="シークレット">
            {secrets.isPending ? (
              <div className="p-4">
                <Skeleton className="h-24" />
              </div>
            ) : secrets.isError ? (
              <div className="p-4">
                <QueryError error={secrets.error} onRetry={() => void secrets.refetch()} />
              </div>
            ) : secrets.data.secrets.length === 0 ? (
              <EmptyState title="まだシークレットがありません">作ったあと、関数の編集画面の「シークレット」で環境変数の名前と一緒に選ぶと、値が関数に入ります。</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left">
                  <thead className="border-b border-line bg-surface-2 text-[13px] text-ink-2">
                    <tr>
                      <th className="px-4 py-2 font-semibold">名前</th>
                      <th className="px-4 py-2 font-semibold">状態</th>
                      <th className="px-4 py-2 font-semibold">つないでいる関数</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line [&>tr:hover]:bg-surface-2">
                    {secrets.data.secrets.map((s) => {
                      const st = secretStatus({ ...s, problem: s.source?.problem ?? "" });
                      return (
                        <tr key={s.name}>
                          <td className="px-4 py-2.5">
                            <button type="button" className="font-medium text-accent hover:underline" onClick={() => setOpen(s.name)}>
                              {s.name}
                            </button>
                          </td>
                          <td className="px-4 py-2.5">
                            <Status level={st.level} label={st.label} />
                          </td>
                          <td className="px-4 py-2.5">{s.functions.length > 0 ? <Mono>{s.functions.join(", ")}</Mono> : <span className="text-muted">なし</span>}</td>
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

/** 値の欄。複数行（PEM の鍵など）も入る。ブラウザに覚えさせない */
function ValueField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const bytes = new TextEncoder().encode(value).length;
  const note = secretValueNote(value);
  return (
    <Field
      label={label}
      error={bytes > MAX_BYTES ? `${MAX_BYTES / 1024} KB までです` : undefined}
      hint={note ?? "保存すると、ここにも GitHub にも二度と表示されません（暗号化したものだけが残ります）"}
      info={<>値はブラウザから API に送られ、すぐにクラスターの Sealed Secrets の公開鍵で暗号化されてから、リポジトリにコミットされます。復号できるのはクラスターの中だけです。コンソールは値を保存しません。</>}
    >
      <textarea
        className={`${input} min-h-[5rem] font-mono text-[13px]`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        data-1p-ignore
        data-lpignore="true"
      />
    </Field>
  );
}

function Create({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const { create } = useSecretMutations();
  return (
    <Panel title="シークレットを作る">
      <form
        className="space-y-4 px-4 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate(
            { name: name.trim(), value },
            {
              onSuccess: () => {
                setValue("");
                onClose();
              },
            },
          );
        }}
      >
        <div className="max-w-sm">
          <Field label="名前" hint="英小文字で始め、英小文字・数字・ハイフンで 40 文字まで。あとから変えられません" info={<>シークレットの名前です（例: <code>anthropic-api-key</code>）。YAML のファイル名（<code>secrets/&lt;名前&gt;.yaml</code>）になります。関数の中の環境変数の名前は、つなぐときに別に決めます。</>}>
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="anthropic-api-key" autoComplete="off" spellCheck={false} />
          </Field>
        </div>
        <ValueField label="値" value={value} onChange={setValue} />
        {create.isError && (
          <p role="alert" className="text-bad">
            {describeMutationError(create.error)}
          </p>
        )}
        <div className="flex gap-3">
          <button type="submit" className={btnPrimary} disabled={create.isPending || name.trim() === "" || value === ""}>
            {create.isPending ? "暗号化して保存中…" : "作る"}
          </button>
          <button type="button" className={btn} onClick={onClose}>
            やめる
          </button>
        </div>
      </form>
    </Panel>
  );
}

function Detail({ secret, onClose }: { secret: Secret; onClose: () => void }) {
  const { update, remove } = useSecretMutations();
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(false);
  const st = secretStatus({ ...secret, problem: secret.source?.problem ?? "" });
  return (
    <div className="space-y-4">
      <Panel
        title={secret.name}
        aside={
          <button type="button" className="text-accent hover:underline" onClick={onClose}>
            一覧に戻る
          </button>
        }
      >
        <dl className="grid gap-x-8 gap-y-3 px-4 py-4 sm:grid-cols-[auto_1fr]">
          <dt className="text-muted">状態</dt>
          <dd>
            <Status level={st.level} label={st.label} />
            {st.detail && <p className="mt-1 break-all text-bad">{st.detail}</p>}
          </dd>
          <dt className="text-muted">値</dt>
          <dd className="text-ink-2">表示できません（暗号化したものだけを置いています）。変えるときは下で上書きします。</dd>
          <dt className="text-muted">つないでいる関数</dt>
          <dd>{secret.functions.length > 0 ? <Mono>{secret.functions.join(", ")}</Mono> : "なし"}</dd>
          <dt className="text-muted">YAML</dt>
          <dd>
            <a href={secret.source?.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
              GitHub で見る
            </a>
            <span className="ml-2 text-xs text-muted">（暗号化した SealedSecret）</span>
          </dd>
        </dl>
      </Panel>

      <Panel title="値を上書きする">
        <form
          className="space-y-3 px-4 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            setSaved(false);
            update.mutate(
              { name: secret.name, value, revision: secret.source?.revision ?? "" },
              {
                onSuccess: () => {
                  setValue("");
                  setSaved(true);
                },
              },
            );
          }}
        >
          <p className="text-ink-2">
            新しい値を暗号化してコミットします。つないでいる関数は、動いていれば 1 分ほどで新しい値の Pod に入れ替わります（0 台なら、次に起きたときから新しい値です）。
          </p>
          <ValueField label="新しい値" value={value} onChange={setValue} />
          {update.isError && (
            <p role="alert" className="text-bad">
              {describeMutationError(update.error)}
            </p>
          )}
          {saved && (
            <p role="status" className="text-ok">
              上書きしました。
            </p>
          )}
          <button type="submit" className={btnPrimary} disabled={update.isPending || value === ""}>
            {update.isPending ? "暗号化して保存中…" : "上書きする"}
          </button>
        </form>
      </Panel>

      <DeployHistory kind="secrets" name={secret.name} revision={secret.source?.revision} />

      <Panel title="シークレットを消す">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <p className="text-ink-2">どの関数にもつながれていないときだけ消せます。git の履歴には暗号化したものが残るので、漏れた値は消すだけでなく、発行元で無効にしてください。</p>
          <button
            type="button"
            className={`${btnDanger} ml-auto`}
            disabled={remove.isPending}
            onClick={() => window.confirm(`シークレット ${secret.name} を消します。`) && remove.mutate({ name: secret.name, revision: secret.source?.revision ?? "" }, { onSuccess: onClose })}
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
