import { z } from "zod";

export const contactSchema = z.object({
  name: z.string().trim().min(1, { message: "入力必須です" }),
  email: z.string().trim().min(1, { message: "入力必須です" }).email({ message: "正しいメールアドレスを入力してください" }),
  purpose: z.string().trim().min(1, { message: "選択してください" }),
  contactMethod: z.union([z.enum(["meet", "discord", "slack", "other"]), z.literal("")]).refine((v) => v !== "", { message: "選択してください" }),
  discordServer: z.string().optional(),
  discordName: z.string().optional(),
  slackWorkspace: z.string().optional(),
  slackName: z.string().optional(),
  otherNote: z.string().optional(),
}).superRefine((val, ctx) => {
  if (val.contactMethod === "discord") {
    if (!val.discordServer || !val.discordServer.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "入力必須です", path: ["discordServer"] });
    if (!val.discordName || !val.discordName.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "入力必須です", path: ["discordName"] });
  }
  if (val.contactMethod === "slack") {
    if (!val.slackWorkspace || !val.slackWorkspace.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "入力必須です", path: ["slackWorkspace"] });
    if (!val.slackName || !val.slackName.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "入力必須です", path: ["slackName"] });
  }
});

export type ContactForm = z.infer<typeof contactSchema>;


