import { useRef, useState, type DragEvent } from "react";
import { Link } from "react-router";
import { objectUrl, useBuckets, useHostingOptions, useObjects, useStorageMutations } from "@/api/console";
import { describeMutationError } from "@/api/errors";
import type { Bucket } from "@/api/gen/taramanji/cloud/v1/console_pb";
import { btn, btnDanger, btnPrimary, Field, InfoTip, input, Status } from "@/components/Form";
import { EmptyState, Mono, PageHeader, Panel, Skeleton } from "@/components/Page";
import { QueryError } from "@/components/QueryError";
import { num } from "@/lib/capacity";
import { formatBytes, formatDateTime } from "@/lib/format";
import { crumbsOf, entriesOf } from "@/lib/hosting";
import { itemsFromDrop, itemsFromFiles, planUpload, type UploadItem } from "@/lib/upload";
import { dnsNote } from "@/pages/CdnPage";
import { DeployHistory } from "@/components/Deploy";
import { StoreDisabled } from "@/pages/FunctionsPage";

export function StoragePage() {
  const options = useHostingOptions();
  const enabled = options.data?.storeEnabled === true;
  const buckets = useBuckets(enabled);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const opt = options.data;
  const current = buckets.data?.buckets.find((b) => b.name === open);

  return (
    <>
      <PageHeader
        title="Storage"
        description={
          opt ? (
            <>
              ファイルを置くバケットです。外に出すときは、CDN（ログインあり）を作るか、バケットを公開します（ログインなしで <Mono>https://&lt;バケット&gt;{opt.storageHostSuffix}/&lt;キー&gt;</Mono>）。
            </>
          ) : (
            "ファイルを置くバケットです。"
          )
        }
        actions={
          enabled &&
          !open &&
          !creating && (
            <button type="button" className={btnPrimary} onClick={() => setCreating(true)}>
              バケットを作る
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
        <Objects bucket={current} storageEnabled={opt.storageEnabled} dnsEnabled={opt.dnsEnabled} onClose={() => setOpen(null)} />
      ) : (
        <div className="space-y-4">
          {creating && <CreateBucket storageHostSuffix={opt.storageHostSuffix} dnsEnabled={opt.dnsEnabled} onClose={() => setCreating(false)} />}
          <Panel title="バケット">
            {buckets.isPending ? (
              <div className="p-4">
                <Skeleton className="h-24" />
              </div>
            ) : buckets.isError ? (
              <div className="p-4">
                <QueryError error={buckets.error} onRetry={() => void buckets.refetch()} />
              </div>
            ) : buckets.data.buckets.length === 0 ? (
              <EmptyState title="まだバケットがありません">名前を決めて作ると、ファイルを置けるようになります。</EmptyState>
            ) : (
              <BucketTable buckets={buckets.data.buckets} onOpen={setOpen} />
            )}
          </Panel>
        </div>
      )}
    </>
  );
}

function CreateBucket({ storageHostSuffix, dnsEnabled, onClose }: { storageHostSuffix: string; dnsEnabled: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [isPublic, setPublic] = useState(false);
  const { createBucket } = useStorageMutations();
  const host = `${name.trim() || "<バケット>"}${storageHostSuffix}`;
  const warning = createBucket.data ? dnsNote(dnsEnabled, createBucket.data.dnsProblem, host) : undefined;
  return (
    <Panel title="バケットを作る">
      <form
        className="space-y-4 px-4 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          createBucket.mutate({ name: name.trim(), public: isPublic }, { onSuccess: (res) => !(isPublic && dnsNote(dnsEnabled, res.dnsProblem, host)) && onClose() });
        }}
      >
        <div className="w-full max-w-sm">
          <Field label="名前" hint="英小文字で始め、英小文字・数字・ハイフンで 40 文字まで。あとから変えられません" info={<>バケットの名前です。関数につなぐと、環境変数 <code>BUCKET_&lt;名前&gt;_URL</code>・<code>BUCKET_&lt;名前&gt;_TOKEN</code> になります（ハイフンは <code>_</code>、英字は大文字）。</>}>
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="site" autoComplete="off" spellCheck={false} />
          </Field>
        </div>
        <PublicCheckbox checked={isPublic} onChange={setPublic} host={host} />
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={btnPrimary} disabled={createBucket.isPending || name.trim() === ""}>
            {createBucket.isPending ? "作成中…" : "作る"}
          </button>
          <button type="button" className={btn} onClick={onClose}>
            {warning ? "閉じる" : "やめる"}
          </button>
        </div>
        {createBucket.isError && (
          <p role="alert" className="text-bad">
            {describeMutationError(createBucket.error)}
          </p>
        )}
        {warning && <p className="text-warn">{warning}</p>}
      </form>
    </Panel>
  );
}

/** 公開（ログインなしの配信）の選択。既定はオフ（S3 のパブリックアクセスのブロックと同じ） */
function PublicCheckbox({ checked, onChange, host }: { checked: boolean; onChange: (v: boolean) => void; host: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2">
      <input type="checkbox" className="mt-1" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="flex items-center gap-1.5 text-ink">
          公開する（ログインなしで配信）
          <InfoTip label="公開">
            オンにすると <code>https://{host}/&lt;キー&gt;</code> で、誰でもログインなしでファイルを読めます（一覧は出ません。書き込みはできません）。5 分キャッシュされます。
            オフのバケットは、CDN（ログインあり）を通してだけ外に出せます。
          </InfoTip>
        </span>
        <span className={`block text-xs ${checked ? "text-warn" : "text-muted"}`}>
          {checked ? `https://${host}/ に置いたファイルは、URL を知っている人なら誰でも見られます。秘密のファイルは置かないでください。` : "オフ: ログインなしでは読めません（既定）"}
        </span>
      </span>
    </label>
  );
}

function BucketTable({ buckets, onOpen }: { buckets: Bucket[]; onOpen: (name: string) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left">
        <thead className="border-b border-line bg-surface-2 text-[13px] text-ink-2">
          <tr>
            <th className="px-4 py-2 font-semibold">名前</th>
            <th className="px-4 py-2 font-semibold">状態</th>
            <th className="px-4 py-2 text-right font-semibold">オブジェクト</th>
            <th className="px-4 py-2 text-right font-semibold">サイズ</th>
            <th className="px-4 py-2 font-semibold">公開</th>
            <th className="px-4 py-2 font-semibold">CDN</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line [&>tr:hover]:bg-surface-2">
          {buckets.map((b) => (
            <tr key={b.name}>
              <td className="px-4 py-2.5">
                <button type="button" className="font-medium text-accent hover:underline" onClick={() => onOpen(b.name)}>
                  {b.name}
                </button>
              </td>
              <td className="px-4 py-2.5">
                {b.source?.problem ? <Status level="bad" label="YAML に問題" /> : b.ready ? <Status level="ok" label="使用可能" /> : <Status level="warn" label="反映待ち" />}
              </td>
              <td className="px-4 py-2.5 text-right text-ink-2">{b.ready ? num(b.objects).toLocaleString("en-US") : "—"}</td>
              <td className="px-4 py-2.5 text-right text-ink-2">{b.ready ? formatBytes(num(b.bytes)) : "—"}</td>
              <td className="px-4 py-2.5">
                {b.public ? (
                  <a href={`https://${b.publicHost}/`} target="_blank" rel="noreferrer" className="rounded border border-warn px-1.5 py-px text-xs font-medium text-warn hover:underline">
                    公開
                  </a>
                ) : (
                  <span className="text-xs text-muted">非公開</span>
                )}
              </td>
              <td className="px-4 py-2.5">
                {b.distributions.length > 0 ? (
                  <Mono>{b.distributions.join(", ")}</Mono>
                ) : (
                  <Link to="/cdn" className="text-accent hover:underline">
                    CDN を作る
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Objects({ bucket, storageEnabled, dnsEnabled, onClose }: { bucket: Bucket; storageEnabled: boolean; dnsEnabled: boolean; onClose: () => void }) {
  const [prefix, setPrefix] = useState("");
  const objects = useObjects(bucket.name, prefix);
  const { upload, deleteObject, deleteBucket } = useStorageMutations();
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [skipped, setSkipped] = useState<{ hidden: string[]; invalid: string[] } | null>(null);
  const [dragging, setDragging] = useState(false);
  const entries = entriesOf(objects.data?.objects ?? [], prefix);
  const usable = storageEnabled && bucket.ready;

  const start = (items: UploadItem[]) => {
    const plan = planUpload(prefix, items);
    setSkipped(plan.hidden.length + plan.invalid.length > 0 ? { hidden: plan.hidden, invalid: plan.invalid } : null);
    if (plan.upload.length === 0) return;
    upload.mutate({ bucket: bucket.name, items: plan.upload, onProgress: (done, total) => setProgress({ done, total }) }, { onSettled: () => setProgress(null) });
  };
  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!usable || upload.isPending) return;
    start(await itemsFromDrop(e.dataTransfer));
  };

  return (
    <div className="space-y-4">
      <PublicPanel bucket={bucket} dnsEnabled={dnsEnabled} />
      <Panel
        title={bucket.name}
        aside={
          <button type="button" className="text-accent hover:underline" onClick={onClose}>
            一覧に戻る
          </button>
        }
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5">
          <nav aria-label="フォルダー" className="flex min-w-0 flex-wrap items-center gap-1 font-mono text-[13px]">
            <button type="button" className="text-accent hover:underline" onClick={() => setPrefix("")}>
              {bucket.name}
            </button>
            {crumbsOf(prefix).map((c) => (
              <span key={c.prefix} className="flex items-center gap-1">
                <span className="text-muted">/</span>
                <button type="button" className="text-accent hover:underline" onClick={() => setPrefix(c.prefix)}>
                  {c.name}
                </button>
              </span>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              multiple
              className="sr-only"
              aria-label="アップロードするファイル"
              onChange={(e) => {
                start(itemsFromFiles(e.target.files ?? []));
                e.target.value = "";
              }}
            />
            <input
              ref={(el) => {
                folderInput.current = el;
                // フォルダーを選ぶ（React の型にない属性なので、ここで付ける）
                el?.setAttribute("webkitdirectory", "");
              }}
              type="file"
              multiple
              className="sr-only"
              aria-label="アップロードするフォルダー"
              onChange={(e) => {
                start(itemsFromFiles(e.target.files ?? []));
                e.target.value = "";
              }}
            />
            <button type="button" className={btn} disabled={!usable || upload.isPending} onClick={() => folderInput.current?.click()}>
              フォルダーを選ぶ
            </button>
            <button type="button" className={btnPrimary} disabled={!usable || upload.isPending} onClick={() => fileInput.current?.click()}>
              {upload.isPending ? "アップロード中…" : "ファイルを選ぶ"}
            </button>
          </div>
        </div>

        {usable && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => void onDrop(e)}
            className={`m-3 rounded-lg border-2 border-dashed px-4 py-5 text-center text-sm ${dragging ? "border-accent bg-accent-soft text-ink" : "border-line text-muted"}`}
          >
            {progress ? (
              <span>
                アップロード中… {progress.done} / {progress.total}
              </span>
            ) : (
              <span>
                ここにファイルやフォルダーをドラッグ&ドロップすると、<Mono>{bucket.name}/{prefix}</Mono> の下にまとめて置きます（フォルダーの中の構造もそのまま）。
                <br />. で始まるファイル（<code>.env</code>・<code>.git/</code> など）は置きません。
              </span>
            )}
          </div>
        )}

        {upload.isError && (
          <p role="alert" className="border-b border-line px-4 py-2 text-bad">
            {upload.error instanceof Error ? `${upload.error.message}（ここまでに置いたファイルは残っています）` : "アップロードできませんでした"}
          </p>
        )}
        {skipped && (
          <p className="border-b border-line px-4 py-2 text-[13px] text-warn">
            {skipped.hidden.length > 0 && <>置かなかった隠しファイル {skipped.hidden.length} 個（{skipped.hidden.slice(0, 3).join("・")}{skipped.hidden.length > 3 ? " など" : ""}）。</>}
            {skipped.invalid.length > 0 && <>置けない名前 {skipped.invalid.length} 個（{skipped.invalid.slice(0, 3).join("・")}）。</>}
          </p>
        )}
        {deleteObject.isError && (
          <p role="alert" className="border-b border-line px-4 py-2 text-bad">
            {describeMutationError(deleteObject.error)}
          </p>
        )}

        {!usable ? (
          <EmptyState title={storageEnabled ? "まだ反映されていません" : "この環境ではストレージが動いていません"}>
            {storageEnabled ? "バケットがストレージに作られるまで、1 分ほどかかります。" : "バケットの定義（YAML）は残りますが、ファイルは置けません。"}
          </EmptyState>
        ) : objects.isPending ? (
          <div className="p-4">
            <Skeleton className="h-24" />
          </div>
        ) : objects.isError ? (
          <div className="p-4">
            <QueryError error={objects.error} onRetry={() => void objects.refetch()} />
          </div>
        ) : entries.length === 0 ? (
          <EmptyState title="ここにはまだ何もありません">上の枠にドラッグ&ドロップするか、「ファイルを選ぶ」「フォルダーを選ぶ」で置けます。</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left">
              <thead className="border-b border-line bg-surface-2 text-[13px] text-ink-2">
                <tr>
                  <th className="px-4 py-2 font-semibold">名前</th>
                  <th className="px-4 py-2 text-right font-semibold">サイズ</th>
                  <th className="px-4 py-2 font-semibold">更新</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line [&>tr:hover]:bg-surface-2">
                {entries.map((e) => (
                  <tr key={e.key}>
                    <td className="px-4 py-2 font-mono text-[13px]">
                      {e.folder ? (
                        <button type="button" className="text-accent hover:underline" onClick={() => setPrefix(e.key)}>
                          {e.name}/
                        </button>
                      ) : (
                        <a href={objectUrl(bucket.name, e.key)} className="text-accent hover:underline">
                          {e.name}
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-ink-2">{formatBytes(e.size)}</td>
                    <td className="px-4 py-2 text-ink-2">{e.folder ? `${e.count} 個` : formatDateTime(e.modifiedMs)}</td>
                    <td className="px-4 py-2 text-right">
                      {!e.folder && (
                        <button
                          type="button"
                          className="text-bad hover:underline disabled:opacity-50"
                          disabled={deleteObject.isPending}
                          onClick={() => window.confirm(`${e.key} を消します。元に戻せません。`) && deleteObject.mutate({ bucket: bucket.name, key: e.key })}
                        >
                          消す
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {objects.data?.truncated && <p className="border-t border-line px-4 py-2 text-xs text-muted">1,000 件までを表示しています。フォルダーを開くと、その中だけを読みます。</p>}
      </Panel>

      <DeployHistory kind="buckets" name={bucket.name} revision={bucket.source?.revision} />

      <Panel title="バケットを消す">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <p className="text-ink-2">空で、どの CDN・関数からも使われていないバケットだけ消せます。公開していたら、その URL も使えなくなります。</p>
          <button
            type="button"
            className={`${btnDanger} ml-auto`}
            disabled={deleteBucket.isPending}
            onClick={() =>
              window.confirm(`バケット ${bucket.name} を消します。`) && deleteBucket.mutate({ name: bucket.name, revision: bucket.source?.revision ?? "" }, { onSuccess: onClose })
            }
          >
            消す
          </button>
          {deleteBucket.isError && (
            <p role="alert" className="w-full text-bad">
              {describeMutationError(deleteBucket.error)}
            </p>
          )}
        </div>
      </Panel>
    </div>
  );
}

/** 公開（ログインなしの配信）の切り替え */
function PublicPanel({ bucket, dnsEnabled }: { bucket: Bucket; dnsEnabled: boolean }) {
  const { updateBucket } = useStorageMutations();
  const host = bucket.publicHost || "";
  const warning = updateBucket.data ? dnsNote(dnsEnabled, updateBucket.data.dnsProblem, updateBucket.data.bucket?.publicHost || host) : undefined;
  const toggle = (next: boolean) => {
    const msg = next
      ? `バケット ${bucket.name} を公開します。置いたファイルは、URL を知っている人なら誰でもログインなしで読めます。`
      : `バケット ${bucket.name} の公開をやめます。https://${host}/ は使えなくなります（ファイルは残ります）。`;
    if (window.confirm(msg)) updateBucket.mutate({ name: bucket.name, public: next, revision: bucket.source?.revision ?? "" });
  };
  return (
    <Panel title="公開（ログインなしの配信）">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        {bucket.public ? (
          <p className="min-w-0 text-ink-2">
            <span className="mr-2 rounded border border-warn px-1.5 py-px text-xs font-medium text-warn">公開中</span>
            <a href={`https://${host}/`} target="_blank" rel="noreferrer" className="break-all font-mono text-[13px] text-accent hover:underline">
              https://{host}/&lt;キー&gt;
            </a>{" "}
            で誰でも読めます（5 分キャッシュ）。
          </p>
        ) : (
          <p className="text-ink-2">非公開です。外に出すときは、CDN（ログインあり）を作るか、ここで公開します。</p>
        )}
        <button
          type="button"
          className={`${bucket.public ? btn : btnDanger} ml-auto`}
          disabled={updateBucket.isPending || !!bucket.source?.problem}
          onClick={() => toggle(!bucket.public)}
        >
          {updateBucket.isPending ? "保存中…" : bucket.public ? "公開をやめる" : "公開する"}
        </button>
        {updateBucket.isError && (
          <p role="alert" className="w-full text-bad">
            {describeMutationError(updateBucket.error)}
          </p>
        )}
        {warning && <p className="w-full text-warn">{warning}</p>}
      </div>
    </Panel>
  );
}
