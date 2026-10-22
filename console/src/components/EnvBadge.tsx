import { envLabel, type Env } from "@/lib/env";

const styles: Record<Env, string> = {
  // 本番は落ち着いた枠線だけ。ふだんいる場所なので目立たせすぎない
  prod: "border border-line-strong text-ink-2",
  stg: "bg-env-stg text-env-stg-ink font-semibold",
  dev: "bg-env-dev text-env-dev-ink font-semibold",
};

export function EnvBadge({ env }: { env: Env }) {
  return (
    <span
      className={`inline-flex h-5 items-center rounded px-1.5 text-xs leading-none ${styles[env]}`}
      title={`環境: ${env}`}
    >
      {envLabel[env]}
    </span>
  );
}

/** 本番以外は画面のいちばん上に細い色の帯を出す（どの環境を触っているか取り違えない） */
export function EnvStripe({ env }: { env: Env | undefined }) {
  if (env !== "stg" && env !== "dev") return null;
  return <div aria-hidden className={`h-[3px] w-full ${env === "stg" ? "bg-env-stg" : "bg-env-dev"}`} />;
}
