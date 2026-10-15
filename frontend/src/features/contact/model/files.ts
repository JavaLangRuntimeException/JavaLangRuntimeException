import type { Locale } from "@/shared/lib/i18n";

// 添付ファイルの規則（旧 ContactForm.tsx と同じ）: 最大 5 個、1 ファイル 3MB 以下、同じファイル名は不可
export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 3 * 1024 * 1024;

export type AttachedFile = { file: File; id: string };

export function addFiles(attached: AttachedFile[], files: File[], locale: Locale = "ja"): { added: AttachedFile[]; errors: string[] } {
  const ja = locale === "ja";
  const errors: string[] = [];
  const added: AttachedFile[] = [];
  if (attached.length + files.length > MAX_FILES) {
    errors.push(ja ? "ファイルは最大5個まで添付できます" : "You can attach up to 5 files");
  }
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      errors.push(`${file.name}: ${ja ? "ファイルサイズは3MB以下にしてください" : "Each file must be 3 MB or smaller"}`);
      continue;
    }
    if (attached.some((a) => a.file.name === file.name)) {
      errors.push(`${file.name}: ${ja ? "同じファイル名のファイルが既に添付されています" : "A file with the same name is already attached"}`);
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
