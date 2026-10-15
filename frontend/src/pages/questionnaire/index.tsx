import { useState } from "react";
import { useAtomValue } from "jotai";
import { ConnectError } from "@connectrpc/connect";
import { heightAtom, isComplete, nameAtom, QuestionnaireForm, responsesAtom, trialPatternAtom, vrUsageAtom } from "@/features/questionnaire";
import { inquiryApi } from "@/shared/api/clients";
import { useT } from "@/shared/lib/i18n";
import { Card, PageContainer } from "@/shared/ui/layout";

export default function QuestionnairePage() {
  const t = useT();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = useAtomValue(nameAtom);
  const vrUsage = useAtomValue(vrUsageAtom);
  const height = useAtomValue(heightAtom);
  const trialPattern = useAtomValue(trialPatternAtom);
  const responses = useAtomValue(responsesAtom);

  const handleSubmit = async () => {
    setError(null);
    if (!isComplete({ name, vrUsage, height, trialPattern, responses })) {
      setError(t({ ja: "すべての質問に回答してください。", en: "Please answer all questions." }));
      return;
    }
    setIsSubmitting(true);
    try {
      await inquiryApi.submitQuestionnaire({
        name,
        vrUsage: vrUsage!,
        // サーバーは整数（int32）で受ける
        height: height!,
        trialPattern: trialPattern!,
        responses: Object.fromEntries(Object.entries(responses).map(([k, v]) => [k, v!])),
      });
      setIsSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      // サーバーが応答した失敗と、通信そのものの失敗で文言を分ける（旧ページと同じ）
      const answered = err instanceof ConnectError && err.metadata.has("x-error-code");
      setError(
        answered
          ? t({ ja: "送信に失敗しました。もう一度お試しください。", en: "Failed to submit. Please try again." })
          : t({ ja: "送信中にエラーが発生しました。", en: "An error occurred while submitting." }),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageContainer width="narrow" className="pt-12">
      <header className="mb-10 flex flex-col items-center gap-2 text-center">
        <h1 className="flex items-center gap-2 text-title-2-semibold text-text-primary">
          {t({ ja: "本実験アンケート", en: "Experiment Questionnaire" })}
        </h1>
        <p className="text-body-regular text-text-secondary">{t({ ja: "実験のご協力ありがとうございました", en: "Thank you for taking part in the experiment" })}</p>
      </header>

      {isSubmitted ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <h2 className="text-title-3-semibold text-text-primary">{t({ ja: "送信完了", en: "Submitted" })}</h2>
          <p className="text-body-regular text-text-secondary">{t({ ja: "アンケートへのご回答ありがとうございました。", en: "Thank you for answering the questionnaire." })}</p>
        </Card>
      ) : (
        <>
          {error && (
            <div role="alert" className="mb-5 rounded-xl border border-border-error-default px-4 py-3 text-body-2-regular text-text-error-primary">
              {error}
            </div>
          )}
          <QuestionnaireForm onSubmit={handleSubmit} isSubmitting={isSubmitting} />
        </>
      )}
    </PageContainer>
  );
}
