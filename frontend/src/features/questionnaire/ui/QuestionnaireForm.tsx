import type { FormEvent } from "react";
import { useAtom } from "jotai";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Radio, RadioGroup } from "@/components/base/radio/radio";
import { Card } from "@/shared/ui/layout";
import { TRIAL_PATTERN_OPTIONS, QUESTIONS, VR_USAGE_OPTIONS } from "../model/questions";
import { isComplete } from "../model/schema";
import { heightAtom, nameAtom, responsesAtom, trialPatternAtom, vrUsageAtom, type TrialPattern, type VrUsage } from "../model/state";
import { LikertScale, NasaTlxScale } from "./scales";

function Section({ title, children, error }: { title: string; children: React.ReactNode; error?: string | false }) {
  return (
    <Card className="flex flex-col gap-3 sm:p-6">
      <h3 className="text-body-semibold text-text-primary">{title}</h3>
      {children}
      {error && <p className="text-caption-1-regular text-text-error-primary">{error}</p>}
    </Card>
  );
}

export function QuestionnaireForm({ onSubmit, isSubmitting }: { onSubmit: () => void; isSubmitting: boolean }) {
  const [name, setName] = useAtom(nameAtom);
  const [vrUsage, setVrUsage] = useAtom(vrUsageAtom);
  const [height, setHeight] = useAtom(heightAtom);
  const [trialPattern, setTrialPattern] = useAtom(trialPatternAtom);
  const [responses, setResponses] = useAtom(responsesAtom);

  const valid = isComplete({ name, vrUsage, height, trialPattern, responses });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (valid && !isSubmitting) onSubmit();
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <Section title="お名前 *" error={name.trim() === "" && "お名前の入力は必須です"}>
        <Input aria-label="お名前" value={name} onChange={setName} isDisabled={isSubmitting} placeholder="山田太郎" />
      </Section>

      <Section title="VRの使用頻度 *" error={vrUsage === null && "VR使用頻度の選択は必須です"}>
        <RadioGroup aria-label="VRの使用頻度" value={vrUsage} onChange={(v) => setVrUsage(v as VrUsage)} isDisabled={isSubmitting}>
          {VR_USAGE_OPTIONS.map((o) => (
            <Radio key={o.value} value={o.value}>
              {o.label}
            </Radio>
          ))}
        </RadioGroup>
      </Section>

      <Section
        title="身長 (cm) *"
        error={height === null ? "身長の入力は必須です" : (height < 100 || height > 250) && "身長は100〜250cmの範囲で入力してください"}
      >
        <Input
          aria-label="身長 (cm)"
          type="number"
          inputMode="numeric"
          value={height === null ? "" : String(height)}
          onChange={(v) => setHeight(v ? Number(v) : null)}
          isDisabled={isSubmitting}
          placeholder="170"
        />
      </Section>

      <Section title="実験の試行パターンを教えてください *" error={trialPattern === null && "試行パターンの選択は必須です"}>
        <RadioGroup aria-label="実験の試行パターン" value={trialPattern} onChange={(v) => setTrialPattern(v as TrialPattern)} isDisabled={isSubmitting}>
          {TRIAL_PATTERN_OPTIONS.map((o) => (
            <Radio key={o.value} value={o.value}>
              {o.label}
            </Radio>
          ))}
        </RadioGroup>
      </Section>

      {QUESTIONS.map((q) => {
        const set = (v: number) => setResponses((prev) => ({ ...prev, [q.key]: v }));
        return q.kind === "likert" ? (
          <LikertScale
            key={q.key}
            value={responses[q.key]}
            onChange={set}
            questionNumber={q.number}
            questionJa={q.ja}
            questionEn={q.en}
            disabled={isSubmitting}
          />
        ) : (
          <NasaTlxScale key={q.key} value={responses[q.key]} onChange={set} label={q.label} questionNumber={q.number} disabled={isSubmitting} />
        );
      })}

      <div className="flex justify-center">
        <Button type="submit" variant="primary" disabled={!valid || isSubmitting} className="min-w-40">
          {isSubmitting ? "送信中..." : "回答を送信"}
        </Button>
      </div>
    </form>
  );
}
