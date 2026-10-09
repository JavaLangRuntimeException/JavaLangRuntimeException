import { atom } from "jotai";

// 入り口の演出（widgets/intro）が出ている間は true。トップのキャッチコピーは幕が開いてから動かす
export const introPlayingAtom = atom(false);
