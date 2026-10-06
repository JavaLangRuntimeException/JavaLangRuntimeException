/** シリーズ（旧 blogs/page.tsx の seriesList と同じ順番・表記） */
export const CHEAT_SHEET_SERIES = "チートシート";

export const SERIES_LIST = [
  CHEAT_SHEET_SERIES,
  "TypeScriptで学ぶプログラミングの世界",
  "IAM AWS User クラウドサービスをフル活用しよう！",
  "Project Gopher: Unlocking Go's Secrets",
] as const;

/** シリーズ名からタイトルの絞り込みに使う語 */
export function getSeriesFilterKeyword(seriesName: string): string {
  if (seriesName === "Project Gopher: Unlocking Go's Secrets") return "Project Gopher";
  return seriesName;
}
