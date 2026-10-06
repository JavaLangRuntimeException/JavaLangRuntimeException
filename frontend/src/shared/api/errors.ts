import { ConnectError, Code } from "@connectrpc/connect";

// サーバーのエラー（Go の errs.DomainError）を画面で扱える形にする。
// code は旧 API と同じ機械可読な文字列（invalid_email など）。メタデータ x-error-code に載っている
export type ApiError = {
  code: string;
  message: string;
  detail?: string;
  fields: { field: string; message: string }[];
  status: Code;
};

export function toApiError(err: unknown): ApiError {
  const ce = ConnectError.from(err);
  const code = ce.metadata.get("x-error-code") ?? Code[ce.code] ?? "unknown";
  let detail: string | undefined;
  const fields: ApiError["fields"] = [];
  for (const d of ce.details) {
    // details は型を知らなくても JSON の debug で中身が読める
    if ("debug" in d && d.debug && typeof d.debug === "object") {
      const dbg = d.debug as { metadata?: Record<string, string>; fieldViolations?: { field: string; description: string }[] };
      if (dbg.metadata?.detail) detail = dbg.metadata.detail;
      for (const v of dbg.fieldViolations ?? []) fields.push({ field: v.field, message: v.description });
    }
  }
  return { code, message: ce.rawMessage, detail, fields, status: ce.code };
}
