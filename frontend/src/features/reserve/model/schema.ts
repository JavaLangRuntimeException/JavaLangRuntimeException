import { z } from "zod";

// 旧 src/shared/validation/reserve.ts と同じ規則・文言
export const contactSchema = z
  .object({
    name: z.string().trim().min(1, { message: "入力必須です" }),
    email: z.string().trim().min(1, { message: "入力必須です" }).email({ message: "正しいメールアドレスを入力してください" }),
    purpose: z.string().trim().min(1, { message: "選択してください" }),
    contactMethod: z
      .union([z.enum(["meet", "discord", "slack", "other", "offline"]), z.literal("")])
      .refine((v) => v !== "", { message: "選択してください" }),
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
      if (!val.discordServer || !val.discordServer.trim()) ctx.addIssue({ code: "custom", message: "入力必須です", path: ["discordServer"] });
      if (!val.discordName || !val.discordName.trim()) ctx.addIssue({ code: "custom", message: "入力必須です", path: ["discordName"] });
    }
    if (val.contactMethod === "slack") {
      if (!val.slackWorkspace || !val.slackWorkspace.trim()) ctx.addIssue({ code: "custom", message: "入力必須です", path: ["slackWorkspace"] });
      if (!val.slackName || !val.slackName.trim()) ctx.addIssue({ code: "custom", message: "入力必須です", path: ["slackName"] });
    }
    if (val.contactMethod === "offline") {
      const link = (val.offlinePlaceLink || "").trim();
      if (!link) {
        ctx.addIssue({ code: "custom", message: "Googleマップの共有リンクを入力してください", path: ["offlinePlaceLink"] });
      } else if (!/^https:\/\/maps\.app\.goo\.gl\//i.test(link)) {
        // https://maps.app.goo.gl/... だけを受け付ける
        ctx.addIssue({ code: "custom", message: "https://maps.app.goo.gl/から始まるリンクを記入してください", path: ["offlinePlaceLink"] });
      }
    }
  });

export type ContactForm = z.infer<typeof contactSchema>;

/** フィールド名 → 最初のエラー文言（旧実装の zodDirectErrors と同じ集め方） */
export function contactErrors(input: Record<string, unknown>): Record<string, string> {
  const result = contactSchema.safeParse(input);
  const errs: Record<string, string> = {};
  if (!result.success) {
    for (const issue of result.error.issues) {
      const path = (issue.path?.[0] as string) || "";
      if (path && issue.message) errs[path] = issue.message;
    }
  }
  return errs;
}
