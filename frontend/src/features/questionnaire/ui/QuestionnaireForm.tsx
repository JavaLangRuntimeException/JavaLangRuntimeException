import type { FormEvent } from "react";
import { useAtom } from "jotai";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Radio, RadioGroup } from "@/components/base/radio/radio";
import { useT } from "@/shared/lib/i18n";
import { TRIAL_PATTERN_OPTIONS, QUESTIONS, VR_USAGE_OPTIONS } from "../model/questions";
import { isComplete } from "../model/schema";
import { heightAtom, nameAtom, responsesAtom, trialPatternAtom, vrUsageAtom, type TrialPattern, type VrUsage } from "../model/state";
import { LikertScale, NasaTlxScale } from "./scales";

function Section({ title, children, error }: { title: string; children: React.ReactNode; error?: string | false }) {
  return (
    <section className="flex flex-col gap-3 border-t border-separator-border pt-6">
      <h3 className="text-body-semibold text-text-primary">{title}</h3>
      {children}
      {error && <p className="text-caption-1-regular text-text-error-primary">{error}</p>}
    </section>
  );
}

export function QuestionnaireForm({ onSubmit, isSubmitting }: { onSubmit: () => void; isSubmitting: boolean }) {
  const t = useT();
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
      <Section title={t({ ja: "お名前 *", en: "Name *" })} error={name.trim() === "" && t({ ja: "お名前の入力は必須です", en: "Please enter your name" })}>
        <Input aria-label={t({ ja: "お名前", en: "Name" })} value={name} onChange={setName} isDisabled={isSubmitting} placeholder={t({ ja: "山田太郎", en: "Jane Doe" })} />
      </Section>

      <Section title={t({ ja: "VRの使用頻度 *", en: "How often do you use VR? *" })} error={vrUsage === null && t({ ja: "VR使用頻度の選択は必須です", en: "Please select how often you use VR" })}>
        <RadioGroup aria-label={t({ ja: "VRの使用頻度", en: "How often you use VR" })} value={vrUsage} onChange={(v) => setVrUsage(v as VrUsage)} isDisabled={isSubmitting}>
          {VR_USAGE_OPTIONS.map((o) => (
            <Radio key={o.value} value={o.value}>
              {t(o.label)}
            </Radio>
          ))}
        </RadioGroup>
      </Section>

      <Section
        title={t({ ja: "身長 (cm) *", en: "Height (cm) *" })}
        error={
          height === null
            ? t({ ja: "身長の入力は必須です", en: "Please enter your height" })
            : (height < 100 || height > 250) && t({ ja: "身長は100〜250cmの範囲で入力してください", en: "Height must be between 100 and 250 cm" })
        }
      >
        <Input
          aria-label={t({ ja: "身長 (cm)", en: "Height (cm)" })}
          type="number"
          inputMode="numeric"
          value={height === null ? "" : String(height)}
          onChange={(v) => setHeight(v ? Number(v) : null)}
          isDisabled={isSubmitting}
          placeholder="170"
        />
      </Section>

      <Section
        title={t({ ja: "実験の試行パターンを教えてください *", en: "Which trial pattern did you do? *" })}
        error={trialPattern === null && t({ ja: "試行パターンの選択は必須です", en: "Please select a trial pattern" })}
      >
        <RadioGroup aria-label={t({ ja: "実験の試行パターン", en: "Trial pattern" })} value={trialPattern} onChange={(v) => setTrialPattern(v as TrialPattern)} isDisabled={isSubmitting}>
          {TRIAL_PATTERN_OPTIONS.map((o) => (
            <Radio key={o.value} value={o.value}>
              {t(o.label)}
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
          <NasaTlxScale
            key={q.key}
            value={responses[q.key]}
            onChange={set}
            questionJa={q.ja}
            questionEn={q.en}
            questionNumber={q.number}
            disabled={isSubmitting}
          />
        );
      })}

      <div className="flex justify-center">
        <Button type="submit" variant="primary" disabled={!valid || isSubmitting} className="min-w-40">
          {isSubmitting ? t({ ja: "送信中...", en: "Sending..." }) : t({ ja: "回答を送信", en: "Submit answers" })}
        </Button>
      </div>
    </form>
  );
}
