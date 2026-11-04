import { Code, ConnectError } from "@connectrpc/connect";

/** Access のセッションがない・切れた（ページを読み直せば Access のログインへ回る） */
export function isAuthError(err: unknown): boolean {
  if (err == null) return false;
  const code = ConnectError.from(err).code;
  return code === Code.Unauthenticated || code === Code.PermissionDenied;
}

/** 画面に出す一文。Connect の英語のメッセージは補足として後ろに付ける */
export function describeError(err: unknown): string {
  const e = ConnectError.from(err);
  switch (e.code) {
    case Code.Unavailable:
      return "API に接続できませんでした。少し待ってから読み直してください。";
    case Code.DeadlineExceeded:
      return "API の応答が時間内に返りませんでした。";
    case Code.FailedPrecondition:
      return "この環境ではこの機能を使えません。";
    default:
      return `API がエラーを返しました（${Code[e.code]}）。`;
  }
}
