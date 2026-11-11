// 環境（prod / stg / dev）の見分け。取り違えないように、本番以外は色で強く示す

export type Env = "prod" | "stg" | "dev";

export function toEnv(value: string | undefined): Env | undefined {
  return value === "prod" || value === "stg" || value === "dev" ? value : undefined;
}

export const envLabel: Record<Env, string> = {
  prod: "本番",
  stg: "stg",
  dev: "dev",
};

export const appVersion: string = import.meta.env.VITE_APP_VERSION ?? "dev";
