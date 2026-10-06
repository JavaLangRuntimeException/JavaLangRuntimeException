import { z } from "zod";

// 旧 ContactForm.tsx の Zod スキーマと文言そのまま
export const contactFormSchema = z.object({
  email: z.string().min(1, "メールアドレスは必須です").email("有効なメールアドレスを入力してください"),
  name: z.string().min(1, "名前は必須です"),
  organization: z.string().optional(),
  subject: z.string().min(1, "件名は必須です"),
  purpose: z.string().min(1, "問い合わせ要件を選択してください"),
  message: z.string().min(1, "本文は必須です"),
  eventId: z.string().optional(),
});

export type ContactFormData = z.infer<typeof contactFormSchema>;
export type ContactFormErrors = Partial<Record<keyof ContactFormData, string>>;

/** 面談予約の変更・取消（Ask Me）のときは EventID も必須 */
export function schemaFor(purpose: string) {
  return purpose === "Ask Me" ? contactFormSchema.extend({ eventId: z.string().min(1, "EventIDは必須です") }) : contactFormSchema;
}

/** 送信時の検証。項目ごとの最初のエラー文言を返す（エラーがなければ空） */
export function validateContact(data: ContactFormData): ContactFormErrors {
  // 旧実装は空の EventID を undefined で検証していたため「Required」と出ていた。空文字で検証して日本語の文言を出す
  const result = schemaFor(data.purpose).safeParse({ ...data, eventId: data.eventId ?? "" });
  if (result.success) return {};
  const errors: ContactFormErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof ContactFormData | undefined;
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return errors;
}

/** 送信ボタンを押せるか（旧実装と同じく EventID 以外の基本スキーマで判定） */
export function isContactValid(data: ContactFormData): boolean {
  return contactFormSchema.safeParse(data).success;
}
