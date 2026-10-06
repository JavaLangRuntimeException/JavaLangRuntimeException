// 添付ファイルの規則（旧 ContactForm.tsx と同じ）: 最大 5 個、1 ファイル 3MB 以下、同じファイル名は不可
export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 3 * 1024 * 1024;

export type AttachedFile = { file: File; id: string };

export function addFiles(attached: AttachedFile[], files: File[]): { added: AttachedFile[]; errors: string[] } {
  const errors: string[] = [];
  const added: AttachedFile[] = [];
  if (attached.length + files.length > MAX_FILES) {
    errors.push("ファイルは最大5個まで添付できます");
  }
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      errors.push(`${file.name}: ファイルサイズは3MB以下にしてください`);
      continue;
    }
    if (attached.some((a) => a.file.name === file.name)) {
      errors.push(`${file.name}: 同じファイル名のファイルが既に添付されています`);
      continue;
    }
    added.push({ file, id: Math.random().toString(36).slice(2, 11) });
  }
  return { added, errors };
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
