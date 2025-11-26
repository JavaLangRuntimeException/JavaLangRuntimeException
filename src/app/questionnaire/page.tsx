"use client";

import React from "react";
import { motion } from "framer-motion";
import { QuestionnaireForm } from "../../feature/questionnaire/ui/QuestionnaireForm";
import { useAtom } from "jotai";
import {
  nameAtom,
  vrUsageAtom,
  heightAtom,
  trialPatternAtom,
  r1Atom,
  r2Atom,
  r3Atom,
  r4Atom,
  r5Atom,
  r6Atom,
  r7Atom,
  r8Atom,
  r9Atom,
  r10Atom,
  r11Atom,
  r12Atom,
  r13Atom,
  r14Atom,
  r15Atom,
  r16Atom,
  r17Atom,
  r18Atom,
} from "../../feature/questionnaire/state";
import { FileText, CheckCircle } from "lucide-react";

export default function QuestionnairePage() {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isSubmitted, setIsSubmitted] = React.useState(false);

  const [name] = useAtom(nameAtom);
  const [vrUsage] = useAtom(vrUsageAtom);
  const [height] = useAtom(heightAtom);
  const [trialPattern] = useAtom(trialPatternAtom);
  const [r1] = useAtom(r1Atom);
  const [r2] = useAtom(r2Atom);
  const [r3] = useAtom(r3Atom);
  const [r4] = useAtom(r4Atom);
  const [r5] = useAtom(r5Atom);
  const [r6] = useAtom(r6Atom);
  const [r7] = useAtom(r7Atom);
  const [r8] = useAtom(r8Atom);
  const [r9] = useAtom(r9Atom);
  const [r10] = useAtom(r10Atom);
  const [r11] = useAtom(r11Atom);
  const [r12] = useAtom(r12Atom);
  const [r13] = useAtom(r13Atom);
  const [r14] = useAtom(r14Atom);
  const [r15] = useAtom(r15Atom);
  const [r16] = useAtom(r16Atom);
  const [r17] = useAtom(r17Atom);
  const [r18] = useAtom(r18Atom);

  const handleSubmit = async () => {
    if (
      name.trim() === "" ||
      vrUsage === null ||
      height === null ||
      trialPattern === null ||
      r1 === null ||
      r2 === null ||
      r3 === null ||
      r4 === null ||
      r5 === null ||
      r6 === null ||
      r7 === null ||
      r8 === null ||
      r9 === null ||
      r10 === null ||
      r11 === null ||
      r12 === null ||
      r13 === null ||
      r14 === null ||
      r15 === null ||
      r16 === null ||
      r17 === null ||
      r18 === null
    ) {
      alert("すべての質問に回答してください。");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/questionnaire", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          vrUsage,
          height,
          trialPattern,
          r1,
          r2,
          r3,
          r4,
          r5,
          r6,
          r7,
          r8,
          r9,
          r10,
          r11,
          r12,
          r13,
          r14,
          r15,
          r16,
          r17,
          r18,
        }),
      });

      if (response.ok) {
        setIsSubmitted(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        alert("送信に失敗しました。もう一度お試しください。");
      }
    } catch (error) {
      console.error("Error submitting questionnaire:", error);
      alert("送信中にエラーが発生しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 to-zinc-100 px-4 py-12">
      <div className="mx-auto max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8 text-center"
        >
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-blue-100 px-6 py-2">
            <FileText className="h-5 w-5 text-blue-600" />
            <h1 className="text-2xl font-bold text-zinc-800">本実験アンケート</h1>
          </div>
          <p className="text-zinc-700">実験のご協力ありがとうございました</p>
        </motion.div>

        {isSubmitted ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center shadow-lg">
              <CheckCircle className="mx-auto mb-4 h-16 w-16 text-green-500" />
              <h2 className="mb-2 text-2xl font-bold text-zinc-800">送信完了</h2>
              <p className="text-zinc-600">
                アンケートへのご回答ありがとうございました。
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <QuestionnaireForm onSubmit={handleSubmit} isSubmitting={isSubmitting} />
          </motion.div>
        )}
      </div>
    </div>
  );
}
