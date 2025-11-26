"use client";

import { atom } from "jotai";
import type { ArticleOgp } from "../articles/types";

export const searchTextAtom = atom("");
export const selectedSeriesAtom = atom("");
export const currentPageAtomLocal = atom(1);
export const itemsPerPageAtom = atom(6);

export const articlesByPageAtom = atom<Map<number, ArticleOgp[]>>(new Map());
export const cheatSheetArticlesAtom = atom<ArticleOgp[]>([]);
export const pageLoadingAtom = atom(false);
export const loadingAtom = atom(false);
export const fetchedPagesAtom = atom(new Set<number>());
export const cacheStatsAtom = atom<{ localCacheSize: number; serverCacheSize: number }>({ localCacheSize: 0, serverCacheSize: 0 });


