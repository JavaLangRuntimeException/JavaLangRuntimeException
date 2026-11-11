// まとめてアップロードするときの、置くファイルの一覧づくり（ドラッグ&ドロップ・フォルダーを選ぶ・ファイルを選ぶ）

/** 置くファイル 1 つ。path はバケットの中のキー（今いるフォルダーからの相対） */
export type UploadItem = { path: string; file: File };

/**
 * 置かないファイル（.env・.git/・.DS_Store など、. で始まる名前）。公開バケットに置き間違えると、そのまま誰でも読めてしまうため。
 * .well-known/（ドメインの確認などに使う決まった場所）だけは置く
 */
export function isHidden(path: string): boolean {
  return path.split("/").some((seg) => seg.startsWith(".") && seg !== ".well-known") || /(^|\/)Thumbs\.db$/i.test(path);
}

/** 置けるキーか（ストレージの決まりと同じ: 空の区切り・. ・.. ・\ なし、1024 文字まで） */
export function isValidKey(key: string): boolean {
  if (key === "" || key.length > 1024 || key.startsWith("/") || key.endsWith("/") || key.includes("\\") || key.includes("\0")) return false;
  return key.split("/").every((seg) => seg !== "" && seg !== "." && seg !== "..");
}

/** 置くもの・置かないもの（隠しファイル）・置けない名前に分ける。prefix は今いるフォルダー（"" か "a/b/"） */
export function planUpload(prefix: string, items: UploadItem[]): { upload: UploadItem[]; hidden: string[]; invalid: string[] } {
  const out = { upload: [] as UploadItem[], hidden: [] as string[], invalid: [] as string[] };
  for (const it of items) {
    if (isHidden(it.path)) {
      out.hidden.push(it.path);
      continue;
    }
    const key = prefix + it.path;
    if (!isValidKey(key)) {
      out.invalid.push(it.path);
      continue;
    }
    out.upload.push({ path: key, file: it.file });
  }
  out.upload.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

/** <input type="file">（複数・フォルダー）で選んだもの。フォルダーなら webkitRelativePath（フォルダー名から）を使う */
export function itemsFromFiles(files: Iterable<File>): UploadItem[] {
  return [...files].map((f) => ({ path: f.webkitRelativePath || f.name, file: f }));
}

/** ドラッグ&ドロップで落としたもの。フォルダーは中まで読み、フォルダー名から始まるパスにする */
export async function itemsFromDrop(dt: DataTransfer): Promise<UploadItem[]> {
  // DataTransferItemList は await のあとに読めなくなるので、先にエントリーを取り出す
  const entries: FileSystemEntry[] = [];
  const loose: File[] = [];
  for (let i = 0; i < dt.items.length; i++) {
    const item = dt.items[i];
    if (item.kind !== "file") continue;
    const entry = item.webkitGetAsEntry?.();
    if (entry) entries.push(entry);
    else {
      const f = item.getAsFile();
      if (f) loose.push(f);
    }
  }
  const out: UploadItem[] = loose.map((f) => ({ path: f.name, file: f }));
  for (const e of entries) await walk(e, "", out);
  return out;
}

async function walk(entry: FileSystemEntry, dir: string, out: UploadItem[]): Promise<void> {
  const path = dir + entry.name;
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
    out.push({ path, file });
    return;
  }
  if (!entry.isDirectory) return;
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  // readEntries は 1 回に全部を返さない（Chrome は 100 件ずつ）。空になるまで読む
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) break;
    for (const child of batch) await walk(child, path + "/", out);
  }
}

/** 並べて置く数。1 つずつだと小さいファイルが多いビルド結果で遅く、多すぎると大きいファイルが詰まる */
export const UPLOAD_CONCURRENCY = 4;

/** items を concurrency 個ずつ並べて置く。1 つでも失敗したら、そのパスを付けて止める（置けたものは残る） */
export async function uploadAll(
  items: UploadItem[],
  put: (item: UploadItem) => Promise<void>,
  onProgress: (done: number, total: number) => void,
  concurrency = UPLOAD_CONCURRENCY,
): Promise<void> {
  let next = 0;
  let done = 0;
  let failed: Error | null = null;
  onProgress(0, items.length);
  const worker = async () => {
    while (failed === null && next < items.length) {
      const item = items[next++];
      try {
        await put(item);
      } catch (e) {
        failed ??= new Error(`${item.path}: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
      onProgress(++done, items.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  if (failed) throw failed;
}
