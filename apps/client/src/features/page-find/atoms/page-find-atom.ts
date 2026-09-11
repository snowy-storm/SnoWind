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

/** Bounding box of the header SearchControl wrap (search box → 本页). */
export type SearchControlAnchor = {
  left: number;
  width: number;
  bottom: number;
};

export const searchControlAnchorAtom = atom<SearchControlAnchor | null>(null);

/** Temporary Base filter query; never persisted to view config. */
export const baseQuickSearchAtom = atom("");
