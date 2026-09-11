import { atom, getDefaultStore } from "jotai";
import { searchSpotlight } from "@/features/search/constants";
import { pageFindStateAtom } from "@/features/page-find/atoms/page-find-atom";

/** Open original global Spotlight (unchanged behavior). */
export function openGlobalSearch() {
  getDefaultStore().set(pageFindStateAtom, (prev) => ({
    ...prev,
    isOpen: false,
  }));
  searchSpotlight.open();
}

/** Open floating this-page find panel. */
export function openPageFind() {
  searchSpotlight.close();
  getDefaultStore().set(pageFindStateAtom, {
    isOpen: true,
    scope: "page",
  });
}

export function closePageFind() {
  getDefaultStore().set(pageFindStateAtom, (prev) => ({
    ...prev,
    isOpen: false,
  }));
}

/** @deprecated use openGlobalSearch */
export function openSearchSpotlight(_scope: "global" | "page" = "global") {
  if (_scope === "page") {
    openPageFind();
    return;
  }
  openGlobalSearch();
}

export const searchSpotlightScopeAtom = atom<"global" | "page">("global");
