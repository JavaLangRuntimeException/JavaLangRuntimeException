import { describe, expect, it } from "vitest";
import { QUESTIONS } from "./questions";
import { isComplete, questionnaireSchema } from "./schema";

const full = {
  name: "山田",
  vrUsage: "weekly" as const,
  height: 170,
  trialPattern: "fours_bearRolling" as const,
  ...Object.fromEntries(Array.from({ length: 18 }, (_, i) => [`r${i + 1}`, i >= 6 && i < 12 ? 20 : 7])),
};

describe("questionnaire", () => {
  it("設問は R1〜R18（R7〜R12 が NASA-TLX）", () => {
    expect(QUESTIONS.map((q) => q.key)).toEqual(Array.from({ length: 18 }, (_, i) => `r${i + 1}`));
    expect(QUESTIONS.filter((q) => q.kind === "tlx").map((q) => q.key)).toEqual(["r7", "r8", "r9", "r10", "r11", "r12"]);
  });
  it("スキーマの範囲（Likert 1〜7・TLX 1〜20・身長 100〜250）", () => {
    expect(questionnaireSchema.safeParse(full).success).toBe(true);
    expect(questionnaireSchema.safeParse({ ...full, r1: 8 }).success).toBe(false);
    expect(questionnaireSchema.safeParse({ ...full, r7: 21 }).success).toBe(false);
    expect(questionnaireSchema.safeParse({ ...full, height: 99 }).success).toBe(false);
  });
  it("未回答があれば送れない", () => {
    const responses = Object.fromEntries(Array.from({ length: 18 }, (_, i) => [`r${i + 1}`, 1])) as Record<string, number | null>;
    expect(isComplete({ name: "a", vrUsage: "none", height: 170, trialPattern: "fours_bearRolling", responses })).toBe(true);
    expect(isComplete({ name: " ", vrUsage: "none", height: 170, trialPattern: "fours_bearRolling", responses })).toBe(false);
    expect(isComplete({ name: "a", vrUsage: "none", height: 170, trialPattern: "fours_bearRolling", responses: { ...responses, r18: null } })).toBe(false);
  });
});
