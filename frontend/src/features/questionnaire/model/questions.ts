import type { ResponseKey } from "./state";

// 設問（旧 QuestionnaireForm.tsx の文言そのまま）

export const VR_USAGE_OPTIONS = [
  { value: "none", label: "全くない" },
  { value: "monthly", label: "月に数回" },
  { value: "weekly", label: "週に数回" },
  { value: "daily", label: "毎日" },
] as const;

export const TRIAL_PATTERN_OPTIONS = [
  { value: "standing_humanSwinging", label: "人間の腕振りで立位姿勢(standing_humanSwinging)" },
  { value: "fours_humanSwinging", label: "人間の腕振りで四つん這い姿勢(fours_humanSwinging)" },
  { value: "standing_bearRolling", label: "クマの腕振りで立位姿勢(standing_bearRolling)" },
  { value: "fours_bearRolling", label: "クマの腕振りで四つん這い姿勢(fours_bearRolling)" },
] as const;

export const LIKERT_GUIDE = [
  "7段階のうち当てはまるものを回答してください",
  "1. とてもそうは思わない(Strongly disagree)",
  "2. そうは思わない(Disagree)",
  "3. ややそうは思わない(Somewhat disagree)",
  "4. どちらとも言えない(Neither agree nor disagree)",
  "5. ややそう思う(Somewhat agree)",
  "6. そう思う(Agree)",
  "7. とてもそう思う(Strongly agree)",
] as const;

export type LikertQuestion = { kind: "likert"; key: ResponseKey; number: string; ja: string; en: string };
export type TlxQuestion = { kind: "tlx"; key: ResponseKey; number: string; label: string };

export const QUESTIONS: (LikertQuestion | TlxQuestion)[] = [
  {
    kind: "likert",
    key: "r1",
    number: "【R1】",
    ja: "ある時点で、私(現実)の身体が、見ているバーチャルの身体(アバタ)の姿勢や形状になり始めているかのように感じた。",
    en: "At some point it felt that the virtual body resembled my own (real) body, in terms of shape, skin tone or other visual features.",
  },
  { kind: "likert", key: "r2", number: "【R2】", ja: "バーチャルの身体(アバタ)が、私自身の身体であるかのように感じた。", en: "I felt as if the virtual body was my body." },
  {
    kind: "likert",
    key: "r3",
    number: "【R3】",
    ja: "私自身の身体が、仮想の身体(アバタ)が見えている場所にあるかのように感じた。",
    en: "I felt as if my body was located where I saw the virtual body.",
  },
  {
    kind: "likert",
    key: "r4",
    number: "【R4】",
    ja: "仮想の身体(アバタ)を、まるで自分自身の身体であるかのように制御できると感じた。",
    en: "I felt like I could control the virtual body as if it was my own body.",
  },
  {
    kind: "likert",
    key: "r5",
    number: "【R5】",
    ja: "仮想の身体(クマの前足)が地面に触れるのを見たとき、その触れた場所で、実際にその感触を感じるように感じた。",
    en: "It seemed as if I felt the touch of the ground in the location where I saw the virtual body touched.",
  },
  {
    kind: "likert",
    key: "r6",
    number: "【R6】",
    ja: "仮想の身体(アバタ)の動きが、私自身の(現実の)動きに影響を与えているように感じた。",
    en: "I felt as if the movements of the virtual body were influencing my own movements.",
  },
  {
    kind: "tlx",
    key: "r7",
    number: "【R7】",
    label:
      "どの程度の知的・知覚的活動(考える、決める、計算する、記憶する、見るなど)を必要としましたか? / How much mental and perceptual activity is required (e.g., thinking, deciding, calculating, remembering, looking, searching, etc.)?",
  },
  {
    kind: "tlx",
    key: "r8",
    number: "【R8】",
    label: "どの程度、身体的活動が必要でしたか?(例.押す、引く、回す、操作する等) / How much physical activity was required (e.g., pushing, pulling, turning, controlling, activating, etc.)?",
  },
  {
    kind: "tlx",
    key: "r9",
    number: "【R9】",
    label:
      "タスクのペースや課題が発生する頻度のために感じる時間的切迫感はどの程度でしたか. / How much time pressure did you feel due to the rate or pace at which the tasks or task elements occurred?",
  },
  {
    kind: "tlx",
    key: "r10",
    number: "【R10】",
    label:
      "作業指示者(またはあなた自身)によって設定されたタスクの目標をどの程度達成できたと思いますか? / How successful do you think you were in accomplishing the goals of the task set by the experimenter (or yourself)?",
  },
  {
    kind: "tlx",
    key: "r11",
    number: "【R11】",
    label:
      "作業成績のレベルを達成・維持するために、精神的・身体的にどの程度いっしょうけんめいに作業しなければなりませんでしたか。 / How hard did you have to work (mentally and physically) to accomplish your level of performance?",
  },
  {
    kind: "tlx",
    key: "r12",
    number: "【R12】",
    label:
      "作業中に、不安感、落胆、いらいら、ストレス、悩みをどの程度感じましたか。 / How insecure, discouraged, irritated, stressed and annoyed versus secure, gratified, content, relaxed and complacent did you feel during the task?",
  },
  { kind: "likert", key: "r13", number: "【R13】", ja: "このタスクをとても楽しんでできた。", en: "I enjoyed doing this activity very much." },
  {
    kind: "likert",
    key: "r14",
    number: "【R14】",
    ja: "私は、この活動がかなり得意で、熟練していると思う。",
    en: "I think I am pretty good and pretty skilled at this activity.",
  },
  {
    kind: "likert",
    key: "r15",
    number: "【R15】",
    ja: "バーチャルの身体(アバタ)なら、普段よりも速く走れると感じた。",
    en: "I felt that my movement speed / ability to run fast was higher than usual.",
  },
  { kind: "likert", key: "r16", number: "【R16】", ja: "実験中、自分の身体(現実)が普段よりも大きく感じた。", en: "During the experiment, I felt larger/taller than usual." },
  { kind: "likert", key: "r17", number: "【R17】", ja: "実験中、自分の身体(現実)が普段よりも重く感じた。", en: "During the experiment, I felt heavier than usual." },
  { kind: "likert", key: "r18", number: "【R18】", ja: "バーチャルの身体(アバタ)に対して、力強さを感じた。", en: "I felt a sense of strength in the virtual body." },
];
