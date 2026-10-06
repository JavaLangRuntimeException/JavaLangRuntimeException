// サーバーのエラーコード → 画面の文言（旧 ContactForm.tsx の alert と同じ）
export const DEFAULT_SUBMIT_ERROR = "送信に失敗しました。もう一度お試しください。";

export function submitErrorMessage(code: string | undefined, detail?: string): string {
  switch (code) {
    case "email_send_failed":
      return "メール送信に失敗しました。しばらく時間をおいてから再度お試しください。" + (detail ? `\n詳細: ${detail}` : "");
    case "missing_required_fields":
      return "必須項目が入力されていません。すべての必須項目をご入力ください。";
    case "invalid_email":
      return "メールアドレスの形式が正しくありません。";
    case "too_many_files":
      return "ファイルは最大5個まで添付できます。";
    case "file_too_large":
      return "ファイルサイズが大きすぎます。1ファイルあたり3MB以下にしてください。";
    default:
      return DEFAULT_SUBMIT_ERROR;
  }
}
