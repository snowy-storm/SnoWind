import { atom } from "jotai";

export type PageFindScope = "page" | "global";

export type PageFindTarget = "document" | "base" | "mermaid" | "none";

export type PageFindState = {
  isOpen: boolean;
  scope: PageFindScope;
};

export const pageFindStateAtom = atom<PageFindState>({
  isOpen: false,
  scope: "page",
});

/** Temporary Base filter query; never persisted to view config. */
export const baseQuickSearchAtom = atom("");
