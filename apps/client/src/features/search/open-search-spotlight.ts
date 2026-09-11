import { atom } from "jotai";
import { getDefaultStore } from "jotai";
import { searchSpotlight } from "@/features/search/constants";

export type SearchSpotlightScope = "global" | "page";

export const searchSpotlightScopeAtom = atom<SearchSpotlightScope>("global");

export function openSearchSpotlight(scope: SearchSpotlightScope = "global") {
  getDefaultStore().set(searchSpotlightScopeAtom, scope);
  searchSpotlight.open();
}

export function setSearchSpotlightScope(scope: SearchSpotlightScope) {
  getDefaultStore().set(searchSpotlightScopeAtom, scope);
}
