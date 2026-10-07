// リリースで JS のファイル名（ハッシュ）が変わると、古い画面を開いたままのタブは消えたファイルを読みに行って失敗する。
// そのときは 1 回だけ画面を読み直して新しい版に切り替える（同じ URL で何度も失敗するなら諦めてエラーを出す）
const KEY = "taramanji_chunk_reload";
const WINDOW_MS = 30_000;

export function reloadOnceForStaleChunk(): boolean {
  try {
    const last = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as { path: string; at: number } | null;
    const path = location.pathname;
    if (last && last.path === path && Date.now() - last.at < WINDOW_MS) return false;
    sessionStorage.setItem(KEY, JSON.stringify({ path, at: Date.now() }));
  } catch {
    // sessionStorage が使えないときは読み直しを繰り返さないよう諦める
    return false;
  }
  location.reload();
  return true;
}

/** ルートの lazy 読み込み。チャンクが見つからなければ 1 回だけ読み直す */
export function loadChunk<T>(load: () => Promise<T>): Promise<T> {
  return load().catch((err: unknown) => {
    if (reloadOnceForStaleChunk()) return new Promise<T>(() => {}); // 読み直すまで待つ
    throw err;
  });
}
