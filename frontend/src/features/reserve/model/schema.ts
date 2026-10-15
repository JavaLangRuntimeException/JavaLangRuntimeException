import { z } from "zod";
import type { L10n, Locale } from "@/shared/lib/i18n";

// 旧 src/shared/validation/reserve.ts と同じ規則・文言（日本語）。英語は同じ意味の文言
const MESSAGES = {
  required: { ja: "入力必須です", en: "This field is required" },
  email: { ja: "正しいメールアドレスを入力してください", en: "Enter a valid email address" },
  select: { ja: "選択してください", en: "Please select an option" },
  mapsRequired: { ja: "Googleマップの共有リンクを入力してください", en: "Enter a Google Maps share link" },
  mapsFormat: { ja: "https://maps.app.goo.gl/から始まるリンクを記入してください", en: "Enter a link that starts with https://maps.app.goo.gl/" },
} satisfies Record<string, L10n>;

/** 表示する言語の文言で検証するスキーマ */
export const contactSchema = (locale: Locale) => {
  const m = (k: keyof typeof MESSAGES) => MESSAGES[k][locale];
  return z
    .object({
      name: z.string().trim().min(1, { message: m("required") }),
      email: z.string().trim().min(1, { message: m("required") }).email({ message: m("email") }),
      purpose: z.string().trim().min(1, { message: m("select") }),
      contactMethod: z
        .union([z.enum(["meet", "discord", "slack", "other", "offline"]), z.literal("")])
        .refine((v) => v !== "", { message: m("select") }),
      discordServer: z.string().optional(),
      discordName: z.string().optional(),
      slackWorkspace: z.string().optional(),
      slackName: z.string().optional(),
      otherNote: z.string().optional(),
      offlinePlaceLink: z.string().optional(),
      offlinePlaceName: z.string().optional(),
      offlinePlaceDetail: z.string().optional(),
    })
    .superRefine((val, ctx) => {
      if (val.contactMethod === "discord") {
        if (!val.discordServer || !val.discordServer.trim()) ctx.addIssue({ code: "custom", message: m("required"), path: ["discordServer"] });
        if (!val.discordName || !val.discordName.trim()) ctx.addIssue({ code: "custom", message: m("required"), path: ["discordName"] });
      }
      if (val.contactMethod === "slack") {
        if (!val.slackWorkspace || !val.slackWorkspace.trim()) ctx.addIssue({ code: "custom", message: m("required"), path: ["slackWorkspace"] });
        if (!val.slackName || !val.slackName.trim()) ctx.addIssue({ code: "custom", message: m("required"), path: ["slackName"] });
      }
      if (val.contactMethod === "offline") {
        const link = (val.offlinePlaceLink || "").trim();
        if (!link) {
          ctx.addIssue({ code: "custom", message: m("mapsRequired"), path: ["offlinePlaceLink"] });
        } else if (!/^https:\/\/maps\.app\.goo\.gl\//i.test(link)) {
          // https://maps.app.goo.gl/... だけを受け付ける
          ctx.addIssue({ code: "custom", message: m("mapsFormat"), path: ["offlinePlaceLink"] });
        }
      }
    });
};

export type ContactForm = z.infer<ReturnType<typeof contactSchema>>;

/** フィールド名 → 最初のエラー文言（旧実装の zodDirectErrors と同じ集め方） */
export function contactErrors(input: Record<string, unknown>, locale: Locale = "ja"): Record<string, string> {
  const result = contactSchema(locale).safeParse(input);
  const errs: Record<string, string> = {};
  if (!result.success) {
    for (const issue of result.error.issues) {
      const path = (issue.path?.[0] as string) || "";
      if (path && issue.message) errs[path] = issue.message;
    }
  }
  return errs;
}
