import type { Locale } from "@/shared/lib/i18n";

// サーバーのエラーコード → 画面の文言（日本語は旧 ContactForm.tsx の alert と同じ）
const DEFAULT: Record<Locale, string> = {
  ja: "送信に失敗しました。もう一度お試しください。",
  en: "Failed to send. Please try again.",
};
export const DEFAULT_SUBMIT_ERROR = DEFAULT.ja;

export function submitErrorMessage(code: string | undefined, detail?: string, locale: Locale = "ja"): string {
  const ja = locale === "ja";
  switch (code) {
    case "email_send_failed":
      return (
        (ja ? "メール送信に失敗しました。しばらく時間をおいてから再度お試しください。" : "Failed to send the email. Please wait a while and try again.") +
        (detail ? `\n${ja ? "詳細" : "Details"}: ${detail}` : "")
      );
    case "missing_required_fields":
      return ja ? "必須項目が入力されていません。すべての必須項目をご入力ください。" : "Some required fields are empty. Please fill in all required fields.";
    case "invalid_email":
      return ja ? "メールアドレスの形式が正しくありません。" : "The email address is not valid.";
    case "too_many_files":
      return ja ? "ファイルは最大5個まで添付できます。" : "You can attach up to 5 files.";
    case "file_too_large":
      return ja ? "ファイルサイズが大きすぎます。1ファイルあたり3MB以下にしてください。" : "A file is too large. Each file must be 3 MB or smaller.";
    default:
      return DEFAULT[locale];
  }
}
