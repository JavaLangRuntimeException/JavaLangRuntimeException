import { z } from "zod";

export const questionnaireSchema = z.object({
  name: z.string().min(1),
  vrUsage: z.enum([
    "none",
    "monthly",
    "weekly",
    "daily",
  ]),
  height: z.number().min(100).max(250),
  trialPattern: z.enum([
    "standing_humanSwinging",
    "fours_humanSwinging",
    "standing_bearRolling",
    "fours_bearRolling",
  ]),
  r1: z.number().min(1).max(7),
  r2: z.number().min(1).max(7),
  r3: z.number().min(1).max(7),
  r4: z.number().min(1).max(7),
  r5: z.number().min(1).max(7),
  r6: z.number().min(1).max(7),
  r7: z.number().min(1).max(20),
  r8: z.number().min(1).max(20),
  r9: z.number().min(1).max(20),
  r10: z.number().min(1).max(20),
  r11: z.number().min(1).max(20),
  r12: z.number().min(1).max(20),
  r13: z.number().min(1).max(7),
  r14: z.number().min(1).max(7),
  r15: z.number().min(1).max(7),
  r16: z.number().min(1).max(7),
  r17: z.number().min(1).max(7),
  r18: z.number().min(1).max(7),
});

export type QuestionnaireForm = z.infer<typeof questionnaireSchema>;
