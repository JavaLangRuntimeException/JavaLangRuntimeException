// デプロイの様子（コントローラーがリポジトリの YAML をクラスターに入れた結果）の表示
import { num } from "./capacity";

export type DeployLevel = "ok" | "warn" | "bad" | "off";

type Deployment = { kind: string; name: string; state: string; message: string; revision: string; commit: string; atMs: bigint | number };

const labels: Record<string, { label: string; level: DeployLevel }> = {
  applied: { label: "反映済み", level: "ok" },
  waiting: { label: "反映中", level: "warn" },
  invalid: { label: "YAML に問題", level: "bad" },
  failed: { label: "失敗", level: "bad" },
  deleted: { label: "削除済み", level: "off" },
};

/** 状態の一文。リポジトリの版（sourceRevision）とまだ違えば「反映待ち」（保存してから 15 秒ほど） */
export function deployState(d: Deployment | undefined, sourceRevision?: string): { label: string; level: DeployLevel; detail?: string } {
  if (!d) return { label: "反映待ち", level: "warn" };
  if (sourceRevision && d.revision && !sourceRevision.startsWith(d.revision) && d.state !== "invalid") return { label: "反映待ち", level: "warn" };
  const s = labels[d.state] ?? { label: d.state, level: "warn" as DeployLevel };
  return { ...s, detail: d.message || undefined };
}

/** 種類と名前で引く */
export function deploymentOf<T extends { kind: string; name: string }>(list: readonly T[] | undefined, kind: string, name: string): T | undefined {
  return list?.find((d) => d.kind === kind && d.name === name);
}

/** 「3 分前」「2 時間前」（1 日を超えたら日付） */
export function ago(atMs: bigint | number, nowMs = Date.now()): string {
  const s = Math.max(0, Math.round((nowMs - num(atMs)) / 1000));
  if (s < 60) return `${s} 秒前`;
  if (s < 3600) return `${Math.floor(s / 60)} 分前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 時間前`;
  const d = new Date(num(atMs));
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const kindLabels: Record<string, string> = { functions: "Functions", apis: "API Gateway", cdn: "CDN", buckets: "Storage", databases: "Databases", secrets: "Secrets Manager" };

export function kindLabel(kind: string): string {
  return kindLabels[kind] ?? kind;
}
