import { createSocket, type Socket } from "node:dgram";

/**
 * Datadog Agent（DaemonSet）へ DogStatsD でメトリクスを送る。追加ライブラリなし。
 * DD_AGENT_HOST（k8s ではノードの IP）が無い環境（Vercel・ローカル開発）では何もしない。
 * UDP なので送りっぱなし。Agent が止まっていてもアプリには影響しない。
 */
const host = process.env.DD_AGENT_HOST;
const port = Number(process.env.DD_DOGSTATSD_PORT || 8125);
// Unified Service Tagging（k8s のラベルと同じ値）
const baseTags = [
  process.env.DD_ENV && `env:${process.env.DD_ENV}`,
  process.env.DD_SERVICE && `service:${process.env.DD_SERVICE}`,
  process.env.DD_VERSION && `version:${process.env.DD_VERSION}`,
].filter(Boolean) as string[];

let socket: Socket | null = null;

type Kind = "gauge" | "count" | "histogram";
const SUFFIX: Record<Kind, string> = { gauge: "g", count: "c", histogram: "h" };

export function sendMetric(name: string, value: number, kind: Kind = "gauge", tags: string[] = []): void {
  if (!host || !Number.isFinite(value)) return;
  if (!socket) {
    socket = createSocket("udp4");
    socket.unref();
    socket.on("error", () => {}); // 送れなくてもアプリは止めない
  }
  const allTags = [...baseTags, ...tags];
  const line = `${name}:${value}|${SUFFIX[kind]}${allTags.length ? `|#${allTags.join(",")}` : ""}`;
  socket.send(line, port, host);
}
