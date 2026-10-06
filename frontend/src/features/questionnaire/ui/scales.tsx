import { useId } from "react";
import { Radio as AriaRadio, RadioGroup as AriaRadioGroup } from "react-aria-components";
import { cx } from "@/utils/cx";
import { LIKERT_GUIDE } from "../model/questions";

function Required({ show, children }: { show: boolean; children: string }) {
  return show ? <p className="text-caption-1-regular text-text-error-primary">{children}</p> : null;
}

/** 7 段階のリッカート尺度 */
export function LikertScale({
  value,
  onChange,
  questionNumber,
  questionJa,
  questionEn,
  disabled,
}: {
  value: number | null;
  onChange: (value: number) => void;
  questionNumber: string;
  questionJa: string;
  questionEn: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <section className="flex flex-col gap-3 border-t border-separator-border pt-6">
      <div id={id} className="flex flex-col gap-1">
        <h3 className="text-body-2-semibold text-text-secondary">{questionNumber}</h3>
        <p className="text-body-regular text-text-primary">{questionJa}</p>
        <p className="text-caption-1-regular italic text-text-tertiary">{questionEn}</p>
      </div>
      <p className="text-caption-1-regular text-text-secondary">
        {LIKERT_GUIDE.map((line, i) => (
          <span key={i}>
            {i > 0 && <br />}
            {line}
          </span>
        ))}
      </p>
      <AriaRadioGroup
        aria-labelledby={id}
        orientation="horizontal"
        value={value === null ? null : String(value)}
        onChange={(v) => onChange(Number(v))}
        isDisabled={disabled}
        className="flex flex-wrap items-center justify-between gap-2"
      >
        <span className="text-caption-1-regular text-text-tertiary">とてもそうは思わない</span>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5, 6, 7].map((v) => (
            <AriaRadio
              key={v}
              value={String(v)}
              className={({ isSelected, isFocusVisible, isDisabled }) =>
                cx(
                  "flex size-10 items-center justify-center rounded-xl border text-body-medium transition-colors",
                  isSelected
                    ? "border-accent-600 bg-accent-600 text-text-white"
                    : "border-border-button-default bg-background-primary-default text-text-primary hover:border-border-button-hover",
                  isFocusVisible && "ring-2 ring-border-focus-ring ring-offset-2",
                  isDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                )
              }
            >
              {v}
            </AriaRadio>
          ))}
        </div>
        <span className="text-caption-1-regular text-text-tertiary">とてもそう思う</span>
      </AriaRadioGroup>
      <Required show={value === null}>回答は必須です</Required>
    </section>
  );
}

/**
 * NASA-TLX の 20 段階（線と線の間の 20 区間から選ぶ）。
 * 初期状態で値を持たせない（回答の偏りを避ける）ため、つまみの位置を持つスライダーではなくラジオで実装する
 */
export function NasaTlxScale({
  value,
  onChange,
  label,
  questionNumber,
  disabled,
}: {
  value: number | null;
  onChange: (value: number) => void;
  label: string;
  questionNumber: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <section className="flex flex-col gap-4 border-t border-separator-border pt-6">
      <h3 id={id} className="text-body-regular text-text-primary">
        <span className="text-body-2-semibold text-text-secondary">{questionNumber}</span> {label}
      </h3>
      <div className="flex justify-between text-caption-1-regular text-text-tertiary">
        <span>低い(Low)</span>
        <span>高い(High)</span>
      </div>
      <AriaRadioGroup
        aria-labelledby={id}
        orientation="horizontal"
        value={value === null ? null : String(value)}
        onChange={(v) => onChange(Number(v))}
        isDisabled={disabled}
        className="relative flex h-24 items-stretch border-s-2 border-text-tertiary"
      >
        {Array.from({ length: 20 }, (_, i) => i + 1).map((position) => (
          <AriaRadio
            key={position}
            value={String(position)}
            aria-label={`選択肢 ${position}`}
            className={({ isSelected, isFocusVisible, isDisabled, isHovered }) =>
              cx(
                "relative flex flex-1 items-center justify-center outline-none",
                // 区切りの縦線（真ん中と右端は太く）
                position === 10 || position === 20 ? "border-e-2 border-text-tertiary" : "border-e border-border-button-default",
                isHovered && !isSelected && "bg-background-secondary-hover",
                isFocusVisible && "bg-accent-500/15 ring-2 ring-inset ring-border-focus-ring",
                isDisabled ? "cursor-not-allowed" : "cursor-pointer",
              )
            }
          >
            {({ isSelected }) =>
              isSelected ? (
                <span className="absolute inset-y-1 flex flex-col items-center justify-between">
                  <span className="w-1 flex-1 rounded-full bg-accent-600" />
                  <span className="mt-1 rounded-full bg-accent-600 px-1.5 py-0.5 text-caption-2-semibold text-text-white">{position}</span>
                </span>
              ) : null
            }
          </AriaRadio>
        ))}
      </AriaRadioGroup>
      <Required show={value === null}>回答は必須です</Required>
    </section>
  );
}
