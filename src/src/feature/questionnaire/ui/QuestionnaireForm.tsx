"use client";

import React from "react";
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
} from "../state";
import { NasaTlxSlider } from "./NasaTlxSlider";

interface LikertScaleProps {
  value: number | null;
  onChange: (value: number) => void;
  questionNumber: string;
  questionJa: string;
  questionEn: string;
  disabled?: boolean;
}

function LikertScale({ value, onChange, questionNumber, questionJa, questionEn, disabled }: LikertScaleProps) {
  return (
    <div className="rounded-2xl border border-white/20 bg-white/90 p-6 shadow-lg backdrop-blur">
      <h3 className="mb-2 text-sm font-semibold text-zinc-700">{questionNumber}</h3>
      <p className="mb-1 text-sm text-zinc-900">{questionJa}</p>
      <p className="mb-4 text-xs italic text-zinc-600">{questionEn}</p>
      <p className="mb-3 text-xs text-zinc-600">
        7段階のうち当てはまるものを回答してください
        <br />
        1. とてもそうは思わない(Strongly disagree)
        <br />
        2. そうは思わない(Disagree)
        <br />
        3. ややそうは思わない(Somewhat disagree)
        <br />
        4. どちらとも言えない(Neither agree nor disagree)
        <br />
        5. ややそう思う(Somewhat agree)
        <br />
        6. そう思う(Agree)
        <br />
        7. とてもそう思う(Strongly agree)
      </p>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-zinc-600">とてもそうは思わない</span>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5, 6, 7].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onChange(v)}
              disabled={disabled}
              className={`flex h-10 w-10 items-center justify-center rounded-lg border-2 transition-all ${
                value === v
                  ? "border-blue-500 bg-blue-500 text-white"
                  : "border-zinc-300 bg-white text-zinc-700 hover:border-blue-400"
              } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
            >
              {v}
            </button>
          ))}
        </div>
        <span className="text-xs text-zinc-600">とてもそう思う</span>
      </div>
      {value === null && <p className="mt-2 text-xs text-red-600">回答は必須です</p>}
    </div>
  );
}

export function QuestionnaireForm({ onSubmit, isSubmitting }: { onSubmit: () => void; isSubmitting: boolean }) {
  const [name, setName] = useAtom(nameAtom);
  const [vrUsage, setVrUsage] = useAtom(vrUsageAtom);
  const [height, setHeight] = useAtom(heightAtom);
  const [trialPattern, setTrialPattern] = useAtom(trialPatternAtom);
  const [r1, setR1] = useAtom(r1Atom);
  const [r2, setR2] = useAtom(r2Atom);
  const [r3, setR3] = useAtom(r3Atom);
  const [r4, setR4] = useAtom(r4Atom);
  const [r5, setR5] = useAtom(r5Atom);
  const [r6, setR6] = useAtom(r6Atom);
  const [r7, setR7] = useAtom(r7Atom);
  const [r8, setR8] = useAtom(r8Atom);
  const [r9, setR9] = useAtom(r9Atom);
  const [r10, setR10] = useAtom(r10Atom);
  const [r11, setR11] = useAtom(r11Atom);
  const [r12, setR12] = useAtom(r12Atom);
  const [r13, setR13] = useAtom(r13Atom);
  const [r14, setR14] = useAtom(r14Atom);
  const [r15, setR15] = useAtom(r15Atom);
  const [r16, setR16] = useAtom(r16Atom);
  const [r17, setR17] = useAtom(r17Atom);
  const [r18, setR18] = useAtom(r18Atom);

  const isFormValid =
    name.trim() !== "" &&
    vrUsage !== null &&
    height !== null &&
    trialPattern !== null &&
    r1 !== null &&
    r2 !== null &&
    r3 !== null &&
    r4 !== null &&
    r5 !== null &&
    r6 !== null &&
    r7 !== null &&
    r8 !== null &&
    r9 !== null &&
    r10 !== null &&
    r11 !== null &&
    r12 !== null &&
    r13 !== null &&
    r14 !== null &&
    r15 !== null &&
    r16 !== null &&
    r17 !== null &&
    r18 !== null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isFormValid && !isSubmitting) {
      onSubmit();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Name Input */}
      <div className="rounded-2xl border border-white/20 bg-white/90 p-6 shadow-lg backdrop-blur">
        <h3 className="mb-4 text-sm font-semibold text-zinc-700">お名前 *</h3>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isSubmitting}
          placeholder="山田太郎"
          className="w-full rounded-md border border-zinc-300 bg-white p-3 text-zinc-900 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-60 disabled:cursor-not-allowed"
        />
        {name.trim() === "" && <p className="mt-2 text-xs text-red-600">お名前の入力は必須です</p>}
      </div>

      {/* VR Usage Frequency */}
      <div className="rounded-2xl border border-white/20 bg-white/90 p-6 shadow-lg backdrop-blur">
        <h3 className="mb-4 text-sm font-semibold text-zinc-700">VRの使用頻度 *</h3>
        <div className="space-y-2">
          {[
            { value: "none", label: "全くない" },
            { value: "monthly", label: "月に数回" },
            { value: "weekly", label: "週に数回" },
            { value: "daily", label: "毎日" },
          ].map((option) => (
            <label key={option.value} className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="vrUsage"
                value={option.value}
                checked={vrUsage === option.value}
                onChange={(e) => setVrUsage(e.target.value as "none" | "monthly" | "weekly" | "daily")}
                disabled={isSubmitting}
                className="h-4 w-4 text-blue-500"
              />
              <span className="text-sm text-zinc-700">{option.label}</span>
            </label>
          ))}
        </div>
        {vrUsage === null && <p className="mt-2 text-xs text-red-600">VR使用頻度の選択は必須です</p>}
      </div>

      {/* Height Input */}
      <div className="rounded-2xl border border-white/20 bg-white/90 p-6 shadow-lg backdrop-blur">
        <h3 className="mb-4 text-sm font-semibold text-zinc-700">身長 (cm) *</h3>
        <input
          type="number"
          value={height ?? ""}
          onChange={(e) => setHeight(e.target.value ? Number(e.target.value) : null)}
          disabled={isSubmitting}
          placeholder="170"
          min="100"
          max="250"
          className="w-full rounded-md border border-zinc-300 bg-white p-3 text-zinc-900 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-60 disabled:cursor-not-allowed"
        />
        {height === null && <p className="mt-2 text-xs text-red-600">身長の入力は必須です</p>}
        {height !== null && (height < 100 || height > 250) && (
          <p className="mt-2 text-xs text-red-600">身長は100〜250cmの範囲で入力してください</p>
        )}
      </div>

      {/* Trial Pattern Selection */}
      <div className="rounded-2xl border border-white/20 bg-white/90 p-6 shadow-lg backdrop-blur">
        <h3 className="mb-4 text-sm font-semibold text-zinc-700">実験の試行パターンを教えてください *</h3>
        <div className="space-y-2">
          {[
            { value: "standing_humanSwinging", label: "人間の腕振りで立位姿勢(standing_humanSwinging)" },
            { value: "fours_humanSwinging", label: "人間の腕振りで四つん這い姿勢(fours_humanSwinging)" },
            { value: "standing_bearRolling", label: "クマの腕振りで立位姿勢(standing_bearRolling)" },
            { value: "fours_bearRolling", label: "クマの腕振りで四つん這い姿勢(fours_bearRolling)" },
          ].map((option) => (
            <label key={option.value} className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="trialPattern"
                value={option.value}
                checked={trialPattern === option.value}
                onChange={(e) => setTrialPattern(e.target.value as "standing_humanSwinging" | "fours_humanSwinging" | "standing_bearRolling" | "fours_bearRolling")}
                disabled={isSubmitting}
                className="h-4 w-4 text-blue-500"
              />
              <span className="text-sm text-zinc-700">{option.label}</span>
            </label>
          ))}
        </div>
        {trialPattern === null && <p className="mt-2 text-xs text-red-600">試行パターンの選択は必須です</p>}
      </div>

      {/* R1-R6: 7-point Likert Scale */}
      <LikertScale
        value={r1}
        onChange={setR1}
        questionNumber="【R1】"
        questionJa="ある時点で、私(現実)の身体が、見ているバーチャルの身体(アバタ)の姿勢や形状になり始めているかのように感じた。"
        questionEn="At some point it felt that the virtual body resembled my own (real) body, in terms of shape, skin tone or other visual features."
        disabled={isSubmitting}
      />

      <LikertScale
        value={r2}
        onChange={setR2}
        questionNumber="【R2】"
        questionJa="バーチャルの身体(アバタ)が、私自身の身体であるかのように感じた。"
        questionEn="I felt as if the virtual body was my body."
        disabled={isSubmitting}
      />

      <LikertScale
        value={r3}
        onChange={setR3}
        questionNumber="【R3】"
        questionJa="私自身の身体が、仮想の身体(アバタ)が見えている場所にあるかのように感じた。"
        questionEn="I felt as if my body was located where I saw the virtual body."
        disabled={isSubmitting}
      />

      <LikertScale
        value={r4}
        onChange={setR4}
        questionNumber="【R4】"
        questionJa="仮想の身体(アバタ)を、まるで自分自身の身体であるかのように制御できると感じた。"
        questionEn="I felt like I could control the virtual body as if it was my own body."
        disabled={isSubmitting}
      />

      <LikertScale
        value={r5}
        onChange={setR5}
        questionNumber="【R5】"
        questionJa="仮想の身体(クマの前足)が地面に触れるのを見たとき、その触れた場所で、実際にその感触を感じるように感じた。"
        questionEn="It seemed as if I felt the touch of the ground in the location where I saw the virtual body touched."
        disabled={isSubmitting}
      />

      <LikertScale
        value={r6}
        onChange={setR6}
        questionNumber="【R6】"
        questionJa="仮想の身体(アバタ)の動きが、私自身の(現実の)動きに影響を与えているように感じた。"
        questionEn="I felt as if the movements of the virtual body were influencing my own movements."
        disabled={isSubmitting}
      />

      {/* R7-R12: NASA-TLX 20-point scale */}
      <NasaTlxSlider
        value={r7}
        onChange={setR7}
        label="どの程度の知的・知覚的活動(考える、決める、計算する、記憶する、見るなど)を必要としましたか? / How much mental and perceptual activity is required (e.g., thinking, deciding, calculating, remembering, looking, searching, etc.)?"
        questionNumber="【R7】"
        disabled={isSubmitting}
      />

      <NasaTlxSlider
        value={r8}
        onChange={setR8}
        label="どの程度、身体的活動が必要でしたか?(例.押す、引く、回す、操作する等) / How much physical activity was required (e.g., pushing, pulling, turning, controlling, activating, etc.)?"
        questionNumber="【R8】"
        disabled={isSubmitting}
      />

      <NasaTlxSlider
        value={r9}
        onChange={setR9}
        label="タスクのペースや課題が発生する頻度のために感じる時間的切迫感はどの程度でしたか. / How much time pressure did you feel due to the rate or pace at which the tasks or task elements occurred?"
        questionNumber="【R9】"
        disabled={isSubmitting}
      />

      <NasaTlxSlider
        value={r10}
        onChange={setR10}
        label="作業指示者(またはあなた自身)によって設定されたタスクの目標をどの程度達成できたと思いますか? / How successful do you think you were in accomplishing the goals of the task set by the experimenter (or yourself)?"
        questionNumber="【R10】"
        disabled={isSubmitting}
      />

      <NasaTlxSlider
        value={r11}
        onChange={setR11}
        label="作業成績のレベルを達成・維持するために、精神的・身体的にどの程度いっしょうけんめいに作業しなければなりませんでしたか。 / How hard did you have to work (mentally and physically) to accomplish your level of performance?"
        questionNumber="【R11】"
        disabled={isSubmitting}
      />

      <NasaTlxSlider
        value={r12}
        onChange={setR12}
        label="作業中に、不安感、落胆、いらいら、ストレス、悩みをどの程度感じましたか。 / How insecure, discouraged, irritated, stressed and annoyed versus secure, gratified, content, relaxed and complacent did you feel during the task?"
        questionNumber="【R12】"
        disabled={isSubmitting}
      />

      {/* R13-R18: 7-point Likert Scale */}
      <LikertScale
        value={r13}
        onChange={setR13}
        questionNumber="【R13】"
        questionJa="このタスクをとても楽しんでできた。"
        questionEn="I enjoyed doing this activity very much."
        disabled={isSubmitting}
      />

      <LikertScale
        value={r14}
        onChange={setR14}
        questionNumber="【R14】"
        questionJa="私は、この活動がかなり得意で、熟練していると思う。"
        questionEn="I think I am pretty good and pretty skilled at this activity."
        disabled={isSubmitting}
      />

      <LikertScale
        value={r15}
        onChange={setR15}
        questionNumber="【R15】"
        questionJa="バーチャルの身体(アバタ)なら、普段よりも速く走れると感じた。"
        questionEn="I felt that my movement speed / ability to run fast was higher than usual."
        disabled={isSubmitting}
      />

      <LikertScale
        value={r16}
        onChange={setR16}
        questionNumber="【R16】"
        questionJa="実験中、自分の身体(現実)が普段よりも大きく感じた。"
        questionEn="During the experiment, I felt larger/taller than usual."
        disabled={isSubmitting}
      />

      <LikertScale
        value={r17}
        onChange={setR17}
        questionNumber="【R17】"
        questionJa="実験中、自分の身体(現実)が普段よりも重く感じた。"
        questionEn="During the experiment, I felt heavier than usual."
        disabled={isSubmitting}
      />

      <LikertScale
        value={r18}
        onChange={setR18}
        questionNumber="【R18】"
        questionJa="バーチャルの身体(アバタ)に対して、力強さを感じた。"
        questionEn="I felt confident moving with the virtual body."
        disabled={isSubmitting}
      />

      {/* Submit Button */}
      <div className="flex justify-center">
        <button
          type="submit"
          disabled={!isFormValid || isSubmitting}
          className={`rounded-xl px-8 py-3 font-semibold text-white transition-all ${
            isFormValid && !isSubmitting
              ? "bg-blue-500 hover:bg-blue-600"
              : "cursor-not-allowed bg-zinc-400"
          }`}
        >
          {isSubmitting ? "送信中..." : "回答を送信"}
        </button>
      </div>
    </form>
  );
}
