import { atom } from "jotai";

// 旧 feature/blogs/state.ts と同じく、検索語・シリーズはページを離れても残る（保存はしない）
export const searchTextAtom = atom("");
export const selectedSeriesAtom = atom("");
export const currentPageAtom = atom(1);
/** 裏で順に取得するページの上限（1 ページ取れるたびに 1 秒待って次へ進む） */
export const prefetchUpToAtom = atom(1);
