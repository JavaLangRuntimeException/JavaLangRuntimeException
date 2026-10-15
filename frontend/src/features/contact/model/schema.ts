import { z } from "zod";
import type { L10n, Locale } from "@/shared/lib/i18n";

// 日本語は旧 ContactForm.tsx の Zod スキーマの文言そのまま
const MESSAGES = {
  emailRequired: { ja: "メールアドレスは必須です", en: "Email is required" },
  emailInvalid: { ja: "有効なメールアドレスを入力してください", en: "Please enter a valid email address" },
  nameRequired: { ja: "名前は必須です", en: "Name is required" },
  subjectRequired: { ja: "件名は必須です", en: "Subject is required" },
  purposeRequired: { ja: "問い合わせ要件を選択してください", en: "Please select a purpose" },
  messageRequired: { ja: "本文は必須です", en: "Message is required" },
  eventIdRequired: { ja: "EventIDは必須です", en: "EventID is required" },
} satisfies Record<string, L10n>;

function baseSchema(locale: Locale) {
  const m = (k: keyof typeof MESSAGES) => MESSAGES[k][locale];
  return z.object({
    email: z.string().min(1, m("emailRequired")).email(m("emailInvalid")),
    name: z.string().min(1, m("nameRequired")),
    organization: z.string().optional(),
    subject: z.string().min(1, m("subjectRequired")),
    purpose: z.string().min(1, m("purposeRequired")),
    message: z.string().min(1, m("messageRequired")),
    eventId: z.string().optional(),
  });
}

export const contactFormSchema = baseSchema("ja");

export type ContactFormData = z.infer<typeof contactFormSchema>;
export type ContactFormErrors = Partial<Record<keyof ContactFormData, string>>;

/** 面談予約の変更・取消（Ask Me）のときは EventID も必須 */
export function schemaFor(purpose: string, locale: Locale = "ja") {
  const base = baseSchema(locale);
  return purpose === "Ask Me" ? base.extend({ eventId: z.string().min(1, MESSAGES.eventIdRequired[locale]) }) : base;
}

/** 送信時の検証。項目ごとの最初のエラー文言を返す（エラーがなければ空） */
export function validateContact(data: ContactFormData, locale: Locale = "ja"): ContactFormErrors {
  // 旧実装は空の EventID を undefined で検証していたため「Required」と出ていた。空文字で検証して日本語の文言を出す
  const result = schemaFor(data.purpose, locale).safeParse({ ...data, eventId: data.eventId ?? "" });
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
