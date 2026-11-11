import { useRef, useState } from "react";
import { Link } from "react-router";
import { objectUrl, useBuckets, useHostingOptions, useObjects, useStorageMutations } from "@/api/console";
import { describeMutationError } from "@/api/errors";
import type { Bucket } from "@/api/gen/taramanji/cloud/v1/console_pb";
import { btn, btnDanger, btnPrimary, Field, input, Status } from "@/components/Form";
import { EmptyState, Mono, PageHeader, Panel, Skeleton } from "@/components/Page";
import { QueryError } from "@/components/QueryError";
import { num } from "@/lib/capacity";
import { formatBytes, formatDateTime } from "@/lib/format";
import { crumbsOf, entriesOf } from "@/lib/hosting";
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
        title="ストレージ"
        description="ファイルを置くバケットです。外に出すときは、CDN でホスト名を付けます。"
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
        <Objects bucket={current} storageEnabled={opt.storageEnabled} onClose={() => setOpen(null)} />
      ) : (
        <div className="space-y-4">
          {creating && <CreateBucket onClose={() => setCreating(false)} />}
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

function CreateBucket({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const { createBucket } = useStorageMutations();
  return (
    <Panel title="バケットを作る">
      <form
        className="flex flex-wrap items-end gap-3 px-4 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          createBucket.mutate(name.trim(), { onSuccess: onClose });
        }}
      >
        <div className="w-full max-w-sm">
          <Field label="名前" hint="英小文字で始め、英小文字・数字・ハイフンで 40 文字まで。あとから変えられません">
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="site" autoComplete="off" spellCheck={false} />
          </Field>
        </div>
        <button type="submit" className={btnPrimary} disabled={createBucket.isPending || name.trim() === ""}>
          {createBucket.isPending ? "作成中…" : "作る"}
        </button>
        <button type="button" className={btn} onClick={onClose}>
          やめる
        </button>
        {createBucket.isError && (
          <p role="alert" className="w-full text-bad">
            {describeMutationError(createBucket.error)}
          </p>
        )}
      </form>
    </Panel>
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

function Objects({ bucket, storageEnabled, onClose }: { bucket: Bucket; storageEnabled: boolean; onClose: () => void }) {
  const [prefix, setPrefix] = useState("");
  const objects = useObjects(bucket.name, prefix);
  const { upload, deleteObject, deleteBucket } = useStorageMutations();
  const fileInput = useRef<HTMLInputElement>(null);
  const entries = entriesOf(objects.data?.objects ?? [], prefix);
  const usable = storageEnabled && bucket.ready;

  return (
    <div className="space-y-4">
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
                const files = [...(e.target.files ?? [])];
                if (files.length > 0) upload.mutate({ bucket: bucket.name, prefix, files });
                e.target.value = "";
              }}
            />
            <button type="button" className={btnPrimary} disabled={!usable || upload.isPending} onClick={() => fileInput.current?.click()}>
              {upload.isPending ? "アップロード中…" : "アップロード"}
            </button>
          </div>
        </div>

        {upload.isError && (
          <p role="alert" className="border-b border-line px-4 py-2 text-bad">
            {upload.error instanceof Error ? upload.error.message : "アップロードできませんでした"}
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
          <EmptyState title="ここにはまだ何もありません">「アップロード」でファイルを置けます。</EmptyState>
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

      <Panel title="バケットを消す">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <p className="text-ink-2">空で、どの CDN からも使われていないバケットだけ消せます。</p>
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
